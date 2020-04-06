import { ISpan, ITokenizationResult, tokenize } from './tokenize'
import { sourceLocations, destinationLocations, conditionTargets, actions, registerActions, registers } from './constants'
import { encodeHTML } from './utils'

/** Reference to a labelled statement */
export interface IReference {
    label: string,
    /** Prefix based on label scope blocks */
    prefix: number[]
}

export interface ILiteral {
    value: number | ILiteral[] | Statement | string | null,
    /** Only used in reference literals, reference to the statemnet this reference points to */
    ref: IReference | null
    span: ISpan
}

/** Abstract base for all statements */
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

    /** Constant statement is used for named data */
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

    /** A label for the next statement if any */
    var nextLabel: string | null = null

    var labeledStatements: { [index: string]: Statement } = {}
    var labelBlockScopeStack: { id: number, lastNumber: number }[] = [{ id: 0, lastNumber: 0 }]
    /** Reference literals waiting to be resolved */
    var unresolvedLiterals: ILiteral[] = []

    /** Prefix to use with labels in the current block */
    var getLabelPrefix = () => labelBlockScopeStack.map(v => v.id)

    // Token iteration variables
    let i = 0, len = result.tokens.length

    /** Get a number from the current token */
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

    /** Start parsing a literal from the current token */
    var parseLiteral = (): ILiteral | null => {
        let token = result.tokens[i]
        if (token?.type == "number") { // Numbers
            return { value: parseNumber(), ref: null, span: token.span }
        } else if (token?.type == "reference") { // References
            let literal = { value: null, ref: { label: token.text.substr(1), prefix: getLabelPrefix() }, span: token.span } as ILiteral
            unresolvedLiterals.push(literal)
            return literal
        } else if (token?.type == "string") { // Strings
            let text = token.text

            if (result.tokens[i + 1]?.type == "arrayLength") { // Detect manual array length
                i++
                // @ts-ignore Because TypeScript thinks the token is still the same even tho i changed
                if (result.tokens[i + 1]?.type == "number") { // Length must be a number
                    i++
                    let length = parseNumber()
                    // Only add size if the length of the provided text is smaller
                    if (length - text.length >= 0) text += Array(length - text.length).fill("\x00").join("")
                    // If the amount of text is bigger than the manually set lenght throw
                    else result.errors.push({ text: `Cannot set length smaller than the length of the string`, span: result.tokens[i].span })
                }
            }

            return { value: text, ref: null, span: token.span }
        } else if (token?.type == "arrayStart") { // Arrays
            let startToken = token
            let value = [] as ILiteral[]
            i++
            for (; i < len; i++) { // Iterate thru all tokens in the array
                let token = result.tokens[i]
                if (token.type == "arrayEnd") { // On "]" end the array
                    break
                } else { // Parse all literals
                    let literal = parseLiteral()
                    if (literal) {
                        value.push(literal)
                    } else { // If parsing the literal failed, the token is not a literal and thus is not allowed to be inside an array
                        result.errors.push({ text: "Unexpected token inside array, expected only literals", span: token.span })
                    }
                }
            }

            // Detect if we broke the for loop or if we reached
            // the end of file, because if we reached the end of
            // file that means there is no "]" and thats wrong
            if (i == len) {
                result.errors.push({ text: "Missing array end", span: result.tokens[i - 1].span })
                return null
            }

            if (result.tokens[i + 1]?.type == "arrayLength") { // Detect manuall array length
                i++
                // @ts-ignore Because TypeScript thinks the token is still the same even tho i changed
                if (result.tokens[i + 1]?.type == "number") { // Length must be a number
                    i++
                    let wantedLength = parseNumber()
                    // Test if wanted length is larger than the amount of array elements already provided
                    if (wantedLength - value.length >= 0) value.push(...Array(wantedLength - value.length).fill({ value: 0, ref: null, span: result.tokens[i].span } as ILiteral))
                    // If wanted length is smaller throw
                    else result.errors.push({ text: `Cannot set length smaller than the amount of elements`, span: result.tokens[i].span })
                }
            }

            return { value, ref: null, span: { from: startToken.span.from, to: result.tokens[i].span.to, source: startToken.span.source } }
        } else {
            return null
        }
    }

    /** Push a statement to the result handling all labeling */
    var pushStatement = (statement: Statement) => {
        result.statements.push(statement)
        if (nextLabel) {
            statement.label = nextLabel
            labeledStatements[nextLabel] = statement
            nextLabel = null
        }
        return statement
    }

    for (; i < len; i++) {
        let token = result.tokens[i]

        if (token.type == "registerAction") { // Register actions
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
        } else if (token.type == "condition") { // Conditions
            // Remove leading "?"
            let text = token.text.substr(1)
            let invert = false
            let or = false
            let targets = [] as (keyof typeof conditionTargets)[]

            text.split("").forEach((v) => { // Iterate thru characters of token text
                if (v == "!") invert = true // Find invert
                else if (v == "|") or = true // Find or
                // Find targets, v is definetly a valid target,
                // otherwise the tokenizer would not even create a token
                else targets.push(v as keyof typeof conditionTargets)
            })

            pushStatement({
                type: "condition",
                invert,
                or,
                span: token.span,
                targets
            } as Statements.IConditionStatement)
        } else if (token.type == "action") { // Normal actions
            let action = token.text.substr(1) as keyof typeof actions

            pushStatement({
                type: "action",
                action,
                span: token.span
            } as Statements.IActionStatement)
        } else if (token.type == "label") { // Labels
            // Cannot label a label
            if (nextLabel) result.errors.push({ text: "Cannot label a label", span: result.tokens[i - 1].span })
            // Set the label for the next statement
            nextLabel = getLabelPrefix() + "!" + token.text.substr(0, token.text.length - 1)
        } else if (token.type == "location") { // Movement
            let destToken = token
            let dest = destToken.text
            let destValue: ILiteral | null = null
            i++

            /** Throw an error about how we are expecting something */
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
                if (destValue) { // If there is a literal is a location with a literal which is denoted by "$" suffix
                    dest += "$"
                    i++
                }

                if (!(dest in destinationLocations)) { // Test if the location is valid
                    result.errors.push({ text: `Invalid destination location ${dest}`, span: destToken.span })
                    continue
                }


                if (result.tokens[i]?.type != "movement") { // Expect a "=" after destination
                    expectedError("movement")
                } else {
                    i++

                    // @ts-ignore Because TypeScript thinks the token is the same, even tho i changed
                    if (result.tokens[i]?.type != "location") {
                        // If there is a literal without a location it must be a literal source
                        let source = parseLiteral()
                        if (source) { // Check if it's accually a literal source
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
                        } else { // If not throw
                            expectedError("location or literal")
                        }
                    } else {
                        let sourceToken = result.tokens[i]
                        let source = sourceToken.text
                        i++

                        let sourceValue = parseLiteral()
                        if (sourceValue) {// If there is a literal is a location with a literal which is denoted by "$" suffix
                            source += "$"
                        } else i--

                        if (!(source in sourceLocations)) { // Test if the location is valid
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
        } else if (token.type == "scopePush") { // Label scope block start
            // Push the new level of the stack
            labelBlockScopeStack.push({ id: labelBlockScopeStack[labelBlockScopeStack.length - 1].lastNumber + 1, lastNumber: 0 })
            // Increment the id of the parent level
            labelBlockScopeStack[labelBlockScopeStack.length - 2].lastNumber++
        } else if (token.type == "scopePop") { // Label scope block end
            if (labelBlockScopeStack.length > 1) { // If we are not the root level we can pop the stack
                labelBlockScopeStack.pop()
            } else { // Otherwise we can't so throw
                result.errors.push({ text: "Unpaired pop", span: token.span })
            }
        } else if (nextLabel && (token.type == "string" || token.type == "arrayStart")) { // Named data
            let literal = parseLiteral() // Parse the literal of the data to name
            if (literal) { // It must be success full
                var statement = {
                    type: "constant",
                    literal: literal,
                    span: literal.span
                } as Statements.IConstantStatement

                if (nextLabel) {
                    statement.label = nextLabel
                    labeledStatements[nextLabel] = statement
                    nextLabel = null
                }

                // No need to push the statement because, constant statements should not emit instructions
            } else throw new Error("Parsing a literal of named data failed, that should be impossible")
        } else { // Any other tokens are invalid
            result.errors.push({ text: "Unexpected token", span: token.span })
        }
    }

    // Resolve literals
    while (unresolvedLiterals.length > 0) {
        var somethingHappend = false

        unresolvedLiterals = unresolvedLiterals.filter(v => {
            if (!v.ref) throw new Error("Statement does not have a ref but is inside unresolved literals")

            var refLabel = v.ref.prefix + "!" + v.ref.label // Calculate the name of the label of the statmenent we could be referencing
            if (refLabel in labeledStatements) { // If it exists we set it and remove this reference from waiting
                let target = labeledStatements[refLabel]
                v.value = target
                somethingHappend = true
                return false
            } else { // If not
                if (v.ref.prefix.length == 1) { // We throw because there is not parent scope that could contain the label
                    result.errors.push({ text: `Referenced label ${v.ref.label} not found`, span: v.span })
                    somethingHappend = true
                    return false
                } else { // There could be a parent scope that contains the label so pop the prefix
                    somethingHappend = true
                    v.ref.prefix.pop()
                }
            }

            return true
        })

        if (!somethingHappend) { // If nothing happened we are in a infinite loop
            // Throw on all waiting statements
            unresolvedLiterals.forEach(v => result.errors.push({ text: `Reference unresolvable`, span: v.span }))
            // And terminate
            break
        }
    }

    return result
}
