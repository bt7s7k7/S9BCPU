import { ISpan, ITokenizationResult, tokenize } from './tokenize'
import { sourceLocations, destinationLocations, conditionTargets, actions, registerActions, registers } from './constants'
import { encodeHTML } from './utils'

export interface IReference {
    label: string,
    prefix: number[]
}

export interface ILiteral {
    value: number | ILiteral[] | Statement | string | null,
    ref: IReference | null
    span: ISpan
}

export interface IStatementBase {
    span: ISpan,
    label: string | null,
}

export namespace Statements {
    export interface IMovementStatement extends IStatementBase {
        from: keyof typeof sourceLocations | null,
        fromLiteral: ILiteral | null,
        to: keyof typeof destinationLocations
        toLiteral: ILiteral | null,
        type: "movement"
    }

    export interface IConditionStatement extends IStatementBase {
        invert: boolean,
        or: boolean,
        targets: (keyof typeof conditionTargets)[],
        type: "condition"
    }

    export interface IActionStatement extends IStatementBase {
        action: keyof typeof actions,
        type: "action"
    }

    export interface IRegisterActionStatement extends IStatementBase {
        action: keyof typeof registerActions,
        target: keyof typeof registers,
        type: "registerAction"
    }

    export interface IConstantStatement extends IStatementBase {
        type: "constant",
        literal: ILiteral
    }
}

type Statement = Statements.IActionStatement | Statements.IConditionStatement | Statements.IMovementStatement | Statements.IRegisterActionStatement | Statements.IConstantStatement

export interface IParseResult extends ITokenizationResult {
    statements: Statement[]
}

export function debugStatement(statement: Statement) {
    var ret = [] as string[]

    var debugLiteral = (literal: ILiteral) => {
        if (literal.ref) {
            ret.push((":" + literal.ref.prefix + "!" + literal.ref.label).fontcolor("firebrick"))
        }
        if (literal.value != null) {
            if (literal.value instanceof Array) {
                ret.push("[")
                literal.value.forEach(v => debugLiteral(v))
                ret.push("]")
            } else if (typeof literal.value == "number") {
                ret.push(literal.value.toString().fontcolor("crimson"))
            } else if (typeof literal.value == "string") {
                ret.push(encodeHTML(JSON.stringify(literal.value)).fontcolor("crimson"))
            } else {
                ret.push(`${literal.value.span.from.line + 1}:${literal.value.span.from.ch}`.fontcolor("crimson"))
            }
        }
    }

    if (statement.label) ret.push((statement.label + ":").fontcolor("yellow"))
    ret.push(statement.type.fontcolor("skyblue"))

    if (statement.type == "action") {
        ret.push(statement.action.fontcolor("lightsalmon"))
    } else if (statement.type == "condition") {
        if (statement.invert) ret.push("inv")
        if (statement.or) ret.push("or")
        ret.push(...statement.targets.map(v => v.fontcolor("cyan")))
    } else if (statement.type == "registerAction") {
        ret.push(statement.action.fontcolor("lightgreen"))
        ret.push(statement.target.fontcolor("lightsalmon"))
    } else if (statement.type == "movement") {
        if (statement.to) ret.push(statement.to.fontcolor("lightgreen"))
        if (statement.toLiteral) {
            debugLiteral(statement.toLiteral)
        }
        ret.push("=".fontcolor("cyan"))
        if (statement.from) ret.push(statement.from.fontcolor("lightgreen"))
        if (statement.fromLiteral) {
            debugLiteral(statement.fromLiteral)
        }
    } else if (statement.type == "constant") {
        debugLiteral(statement.literal)
    }

    return ret.join(" ")
}

export function parse(code: string) {
    var result = {
        ...tokenize(code),
        statements: []
    } as IParseResult

    var nextLabel: string | null = null

    var labelReferences: { [index: string]: Statement } = {}
    var nameBlockStack: { id: number, lastNumber: number }[] = [{ id: 0, lastNumber: 0 }]
    var unresolvedLiterals: ILiteral[] = []

    var getLabelPrefix = () => nameBlockStack.map(v => v.id)

    let i = 0, len = result.tokens.length
    var parseNumber = () => {
        let literal = 0
        let literalText = result.tokens[i].text
        if (literalText[0] == "'") {
            literal = literalText.charCodeAt(1)
        } else if (literalText[1] == "b") {
            literal = parseInt(literalText.substr(2), 2)
        } else if (literalText[1] == "x") {
            literal = parseInt(literalText.substr(2), 16)

        } else {
            literal = parseInt(literalText)
        }

        return literal
    }

    var parseLiteral = (): ILiteral | null => {
        let token = result.tokens[i]
        if (token?.type == "number") {
            return { value: parseNumber(), ref: null, span: token.span }
        } else if (token?.type == "reference") {
            let literal = { value: null, ref: { label: token.text.substr(1), prefix: getLabelPrefix() }, span: token.span } as ILiteral
            unresolvedLiterals.push(literal)
            return literal
        } else if (token?.type == "string") {
            let text = token.text

            if (result.tokens[i + 1]?.type == "arrayLength") {
                i++
                // @ts-ignore Because TypeScript thinks the token is still the same even tho i changed
                if (result.tokens[i + 1]?.type == "number") {
                    i++
                    let length = parseNumber()

                    if (length - text.length >= 0) text += Array(length - text.length).fill("\x00").join("")
                    else result.errors.push({ text: `Cannot set length smaller than the length of the string`, span: result.tokens[i].span })
                }
            }

            return { value: text, ref: null, span: token.span }
        } else if (token?.type == "arrayStart") {
            let startToken = token
            let value = [] as ILiteral[]
            i++
            for (; i < len; i++) {
                let token = result.tokens[i]
                if (token.type == "arrayEnd") {
                    break
                } else {
                    let literal = parseLiteral()
                    if (literal) {
                        value.push(literal)
                    } else {
                        result.errors.push({ text: "Unexpected token inside array, expected only literals", span: token.span })
                    }
                }
            }

            if (i == len) {
                result.errors.push({ text: "Missing array end", span: result.tokens[i - 1].span })
                return null
            }

            if (result.tokens[i + 1]?.type == "arrayLength") {
                i++
                // @ts-ignore Because TypeScript thinks the token is still the same even tho i changed
                if (result.tokens[i + 1]?.type == "number") {
                    i++
                    let wantedLength = parseNumber()

                    if (wantedLength - value.length >= 0) value.push(...Array(wantedLength - value.length).fill({ value: 0, ref: null, span: result.tokens[i].span } as ILiteral))
                    else result.errors.push({ text: `Cannot set length smaller than the amount of elements`, span: result.tokens[i].span })
                }
            }

            return { value, ref: null, span: { from: startToken.span.from, to: result.tokens[i].span.to, source: startToken.span.source } }
        } else {
            return null
        }
    }

    var pushStatement = (statement: Statement) => {
        result.statements.push(statement)
        if (nextLabel) {
            statement.label = nextLabel
            labelReferences[nextLabel] = statement
            nextLabel = null
        }
        return statement
    }

    for (; i < len; i++) {
        let token = result.tokens[i]

        if (token.type == "registerAction") {
            let action = token.text[0] as keyof typeof registerActions
            let target = token.text[1] as keyof typeof registers

            result.statements.push({
                type: "registerAction",
                action,
                label: nextLabel,
                span: token.span,
                target
            })
            nextLabel = null
        } else if (token.type == "condition") {
            let text = token.text.substr(1)
            let invert = false
            let or = false
            let targets = [] as (keyof typeof conditionTargets)[]

            text.split("").forEach((v) => {
                if (v == "!") invert = true
                else if (v == "|") or = true
                else targets.push(v as keyof typeof conditionTargets)
            })

            pushStatement({
                type: "condition",
                invert,
                or,
                span: token.span,
                targets
            } as Statements.IConditionStatement)
        } else if (token.type == "action") {
            let action = token.text.substr(1) as keyof typeof actions

            pushStatement({
                type: "action",
                action,
                span: token.span
            } as Statements.IActionStatement)
        } else if (token.type == "label") {
            if (nextLabel) result.errors.push({ text: "Cannot label a label", span: result.tokens[i - 1].span })
            nextLabel = getLabelPrefix() + "!" + token.text.substr(0, token.text.length - 1)
        } else if (token.type == "location") {
            let destToken = token
            let dest = destToken.text
            let destValue: ILiteral | null = null
            i++

            let expectedError = (expected: string) => {
                if (result.tokens[i]) result.errors.push({
                    text: "Unexpected token, expected " + expected,
                    span: result.tokens[i].span
                })
                else result.errors.push({
                    text: "Missing " + expected,
                    span: result.tokens[i - 1].span
                })
            }

            destValue = parseLiteral()
            if (!destValue && result.tokens[i]?.type != "movement") {
                expectedError("movement, literal or reference")
            } else {
                if (destValue) {
                    dest += "$"
                    i++
                }

                if (!(dest in destinationLocations)) {
                    result.errors.push({ text: `Invalid destination location ${dest}`, span: destToken.span })
                    continue
                }


                if (result.tokens[i]?.type != "movement") {
                    expectedError("movement")
                } else {
                    i++

                    // @ts-ignore Because TypeScript thinks the token is the same, even tho i changed
                    if (result.tokens[i]?.type != "location") {
                        let source = parseLiteral()
                        if (source) {
                            pushStatement({
                                type: "movement",
                                from: "$",
                                to: dest,
                                toLiteral: destValue,
                                fromLiteral: source,
                                span: {
                                    from: destToken.span.from,
                                    to: source.span.to,
                                    source: source.span.source
                                }
                            } as Statements.IMovementStatement)
                        } else {
                            expectedError("location or literal")
                        }
                    } else {
                        let sourceToken = result.tokens[i]
                        let source = sourceToken.text
                        i++

                        let sourceValue = parseLiteral()
                        if (sourceValue) {
                            source += "$"
                        } else i--

                        if (!(source in sourceLocations)) {
                            result.errors.push({ text: `Invalid source location ${source}`, span: sourceToken.span })
                            continue
                        }

                        pushStatement({
                            type: "movement",
                            from: source,
                            fromLiteral: sourceValue,
                            span: {
                                from: destToken.span.from,
                                to: sourceToken.span.to,
                                source: sourceToken.span.source
                            },
                            to: dest,
                            toLiteral: destValue
                        } as Statements.IMovementStatement)
                    }
                }
            }
        } else if (token.type == "scopePush") {
            nameBlockStack.push({ id: nameBlockStack[nameBlockStack.length - 1].lastNumber + 1, lastNumber: 0 })
            nameBlockStack[nameBlockStack.length - 2].lastNumber++
        } else if (token.type == "scopePop") {
            if (nameBlockStack.length > 1) {
                nameBlockStack.pop()
            } else {
                result.errors.push({ text: "Unpaired pop", span: token.span })
            }
        } else if (nextLabel) {
            if (token.type == "string" || token.type == "arrayStart") {
                let literal = parseLiteral()
                if (literal) {
                    var statement = {
                        type: "constant",
                        literal: literal,
                        span: literal.span
                    } as Statements.IConstantStatement

                    if (nextLabel) {
                        statement.label = nextLabel
                        labelReferences[nextLabel] = statement
                        nextLabel = null
                    }

                    // No need to push the statement because, constant statements should not emit instructions
                }
            }
        } else {
            result.errors.push({ text: "Unexpected token", span: token.span })
        }
    }

    while (unresolvedLiterals.length > 0) {
        var somethingHappend = false

        unresolvedLiterals = unresolvedLiterals.filter(v => {
            if (!v.ref) throw new Error("Statement does not have a ref but is inside unresolved literals")

            var refLabel = v.ref.prefix + "!" + v.ref.label
            if (refLabel in labelReferences) {
                let target = labelReferences[refLabel]
                v.value = target
                somethingHappend = true
                return false
            } else {
                if (v.ref.prefix.length == 1) {
                    result.errors.push({ text: `Referenced label ${v.ref.label} not found`, span: v.span })
                    somethingHappend = true
                    return false
                } else {
                    somethingHappend = true
                    v.ref.prefix.pop()
                }
            }

            return true
        })

        if (!somethingHappend) {
            unresolvedLiterals.forEach(v=>result.errors.push({ text: `Reference unresolvable`, span: v.span }))
        }
    }

    return result
}
