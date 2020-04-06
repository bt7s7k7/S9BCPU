import { Position } from 'codemirror';
import { findBestMatch } from "string-similarity"

export interface ISpan {
    from: Position
    to: Position
    source: string
}

export interface ISymbol {
    label: string,
    position: Position,
    address: number
}

interface IAssemblerMessage {
    text: string;
    span: ISpan;
}

export interface IAssembledOutput extends IParseResult {
    binOut: number[],
    symbols: ISymbol[]
}

type TokenType = "label"
    | "reference"
    | "location"
    | "number"
    | "movement"
    | "string"
    | "condition"
    | "action"
    | "registerAction"
    | "arrayStart"
    | "arrayEnd"
    | "arrayLength"
    | "macro"
    | "macroArgStart"
    | "macroArgEnd"
    | "declare"
    | "scopePush"
    | "scopePop"

export interface ITokenizationResult {
    errors: IAssemblerMessage[],
    tokens: IToken[],
    annotations: IAssemblerMessage[],
    rootMacroScope: IMacroScope
}

export interface IToken {
    text: string,
    span: ISpan,
    type: TokenType
}

const sourceLocations = {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    sum: 0,
    sub: 0,
    and: 0,
    or: 0,
    xor: 0,
    stackptr$: 0,
    stack: 0,
    mem: 0,
    stack$: 0,
    mem$: 0,
    $: 0,
    zero: 0
}

const destinationLocations = {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    m: 0,
    n: 0,
    pc: 0,
    push: 0,
    stack: 0,
    mem: 0,
    out: 0,
    stack$: 0,
    mem$: 0
}

const validLocations = [...new Set([...Object.keys(sourceLocations), ...Object.keys(destinationLocations)].map(v => v.replace(/\$/g, "")))]

const actions = {
    done: 0,
    pause: 0,
    halt: 0,
    pop: 0
}

const registerActions = {
    "!": 0,
    "+": 0,
    "-": 0,
    "<": 0,
    ">": 0
}

const registers = {
    a: 0,
    b: 0,
    c: 0,
    d: 0
}

const validActions = Object.keys(actions)

export interface IMacro {
    name: string,
    arguments: string[],
    body: IToken[]
}

export interface IMacroScope {
    macros: { [index: string]: IMacro },
    parent: IMacroScope | null
}


export function tokenize(code: string) {
    var result = {
        errors: [],
        tokens: [],
        annotations: [],
        rootMacroScope: { macros: {}, parent: null }
    } as ITokenizationResult

    var position = 0
    var line = 0
    var ch = 0

    var makePos = () => ({
        from: lastPositionObject,
        to: { ch, line },
        source: code
    } as ISpan)

    var inString = false
    var blockComment = false
    var lineComment = false
    var declareHead = false
    var declareBody = false

    var stringValue = ""
    var currMacro: IMacro | null = null
    var rootMacroScope = result.rootMacroScope

    var matchText: string | null = null
    var match = (pattern: RegExp | string) => {
        var result = code.substr(position).match(pattern)
        if (result) {
            position += result[0].length
            ch += result[0].length
            matchText = result[0]
            return true
        } else {
            matchText = null
            return false
        }
    }

    var next = () => {
        var char = code[position]
        if (char == "\n") {
            line++
            ch = 0
            position++
            return true
        }
        ch++
        position++
        return false
    }

    var eatSpace = () => {
        if (code[position].match(/^\s/)) {
            next()
            return true
        } else return false
    }

    var pushToken = (type: TokenType) => {
        if (!matchText) throw new Error(`pushToken called without matchText being at ${line + 1}:${ch} with ${type} type`)
        if (declareHead) {
            if (type != "macro") {
                result.errors.push({
                    text: `Declare header can only contain the name of the macro and arguments at ${line + 1}:${ch}`,
                    span: makePos()
                })
            } else {
                if (!currMacro) throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`)
                if (!currMacro.name) currMacro.name = matchText
                else currMacro.arguments.push(matchText)
            }

        } else {
            let token = {
                span: makePos(),
                text: matchText,
                type: type
            } as IToken
            if (declareBody) {
                if (!currMacro) throw new Error(`Current macro not set inside declare body at ${line + 1}:${ch}`)
                currMacro.body.push(token)
            } else {
                result.tokens.push(token)
            }
        }
    }

    var lastPosition = -1
    var lastPositionObject = { ch, line } as Position
    while (position < code.length) {
        if (lastPosition == position) throw new Error(`Infinite loop in tokenizer at ${position} ${line + 1}:${ch}`)
        lastPosition = position
        lastPositionObject = { ch, line }
        if (blockComment) {
            if (match(/^\*\//)) {
                blockComment = false
            } else {
                next()
            }
        } else if (lineComment) {
            if (next()) lineComment = false
        } else if (inString) {
            if (match(/^\\(["n]|[\da-fA-F]{2})/)) {
                if (matchText == "\\\"") {
                    stringValue += `"`
                } else if (matchText == "\\n") {
                    stringValue += "\n"
                } else {
                    stringValue += String.fromCharCode(parseInt(matchText!.substr(1), 16))
                }
            } else if (match(/^"/)) {
                inString = false
                result.tokens.push({
                    span: makePos(),
                    text: stringValue,
                    type: "string"
                })
                stringValue = ""
            } else {
                stringValue += code[position]
                next()
            }
        } else if (match(/^"/)) {
            inString = true
        } else if (match(/^\/\*/)) {
            blockComment = true
        } else if (match(/^\/\//)) {
            lineComment = true
        } else if (match(/^\w+:/)) { // Label
            pushToken("label")
        } else if (match(/^:\w+/)) { // Reference
            pushToken("reference")
        } else if (match(/^(((0[xb])?[0-9]+)|('.))/)) { // Number
            pushToken("number")
        } else if (match(/^[a-z]+/)) { // Location
            if (validLocations.includes(matchText!)) pushToken("location")
            else {
                var alts = findBestMatch(matchText!, validLocations).ratings.filter(v => v.rating > 0.5).sort((a, b) => b.rating - a.rating).map(v => v.target)

                result.errors.push({
                    span: makePos(),
                    text: `Unknown location ${matchText} at ${line + 1}:${ch} ${alts.length > 0 ? `\n  Did you mean ${alts.slice(0, 4).join(", ")}` : ""}`
                })
            }
        } else if (declareHead && match(/^\{/)) {
            if (!currMacro) throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`)
            declareHead = false
            declareBody = true
            if (!currMacro.name) {
                result.errors.push({
                    text: `No name set in define at ${line + 1}:${ch}`,
                    span: makePos()
                })
            }
        } else if (declareBody && match(/^\}/)) {
            if (!currMacro) throw new Error(`No current macro set but is inside definition at ${line + 1}:${ch}`)
            rootMacroScope.macros[currMacro.name] = currMacro
            declareBody = false
            currMacro = null
        } else if (match(/^#push/)) {
            pushToken("scopePush")
        } else if (match(/^#pop/)) {
            pushToken("scopePop")
        } else if (match(/^=/)) { // Movement
            pushToken("movement")
        } else if (match(/^\?!?\|?[abcCZ]+/)) { // Condition
            pushToken("condition")
        } else if (match(/^![a-z]+/)) {
            let actionName = matchText!.substr(1)
            if (actionName in actions) {
                pushToken("action")
            } else {
                var alts = findBestMatch(matchText!, validActions).ratings.filter(v => v.rating > 0.5).sort((a, b) => b.rating - a.rating).map(v => v.target)

                result.errors.push({
                    span: makePos(),
                    text: `Unknown action ${matchText} at ${line + 1}:${ch} ${alts.length > 0 ? `\n  Did you mean ${alts.slice(0, 4).join(", ")}` : ""}`
                })
            }
        } else if (match(/^[!+-<>][abcd]/)) { // Register action
            pushToken("registerAction")
        } else if (match(/^\[/)) {
            pushToken("arrayStart")
        } else if (match(/^\]/)) {
            pushToken("arrayEnd")
        } else if (match(/^~/)) {
            pushToken("arrayLength")
        } else if (match(/^[A-Z\d_]+/)) {
            pushToken("macro")
        } else if (match(/^\(/)) {
            pushToken("macroArgStart")
        } else if (match(/^\)/)) {
            pushToken("macroArgEnd")
        } else if (match(/^#define/)) {
            declareHead = true
            currMacro = {
                name: "",
                arguments: [],
                body: []
            }
        } else if (eatSpace()) { // Whitespace

        } else {
            result.errors.push({
                span: makePos(),
                text: `Unexpected character at ${line + 1}:${ch}`
            })
            next()
        }
    }

    if (blockComment) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated block comment`
        })
    }

    if (inString) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated string`
        })
    }

    if (declareHead) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated declare header`
        })
    }

    if (declareBody) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated declare body`
        })
    }

    expandMacros(result.tokens, result.rootMacroScope, {}, [], result, true)

    return result
}

export function expandMacros(tokens: IToken[], scope: IMacroScope, annotations: { [index: string]: IAssemblerMessage }, callStack: string[], result: ITokenizationResult, root: boolean) {
    var findMacro = (name: string, scope: IMacroScope): IMacro | null => {
        if (name in scope.macros) {
            return scope.macros[name]
        } else {
            return scope.parent ? findMacro(name, scope.parent) : null
        }
    }

    var expandMacro = (target: IToken[] | null, source: IToken[], sourceOffset: number, scope: IMacroScope, result: ITokenizationResult, callStack: string[]): number => {
        var name = source[sourceOffset].text
        var position = source[sourceOffset].span

        var macro = findMacro(name, scope)
        if (!macro) {
            result.errors.push({ text: `Cannot find macro named ${macro}`, span: source[sourceOffset].span })
            return sourceOffset + 1
        }

        var args = [] as IToken[][]
        var group = false

        let startOffset = sourceOffset
        if (source.length > sourceOffset + 1 && source[sourceOffset + 1].type == "macroArgStart") {
            startOffset = sourceOffset + 2
            for (; startOffset < source.length; startOffset++) {
                let token = source[startOffset]
                let makeTarget = () => {
                    if (group) {
                        return args[args.length - 1]
                    } else {
                        let ret = [] as IToken[]
                        args.push(ret)
                        return ret
                    }
                }
                if (token.type == "macroArgStart") {
                    if (group) {
                        result.errors.push({ text: `Cannot start a group in a group`, span: token.span })
                    } else {
                        makeTarget()
                        group = true
                    }
                } else if (token.type == "macroArgEnd") {
                    if (group) {
                        group = false
                    } else {
                        break
                    }
                } else if (token.type == "macro") {
                    startOffset = expandMacro(makeTarget(), source, startOffset, scope, result, [...callStack, name])
                } else {
                    makeTarget().push(token)
                }
            }
            if (!(target instanceof Array)) source.splice(sourceOffset, startOffset - sourceOffset + 1)
        } else {
            if (!(target instanceof Array)) source.splice(sourceOffset, 1)
        }

        if (args.length != macro.arguments.length) {
            result.errors.push({
                text: `Macro ${name} requires ${macro.arguments.length} arguments (${macro.arguments.join(", ")}) but ${args.length} provided`,
                span: position
            })
            return sourceOffset
        }

        if (args.length > 0 && !(`${position.from.line}:${position.from.ch}` in annotations)) {
            result.annotations.push(annotations[`${position.from.line}:${position.from.ch}`] = {
                span: position,
                text: `${macro.name}(${macro.arguments.join(", ")})`
            })
        }

        var closure = {
            parent: scope,
            macros: {}
        } as IMacroScope

        args.forEach((v, i) => {
            var name = macro!.arguments[i]
            closure.macros[name] = {
                name,
                arguments: [],
                body: v
            }
        })

        var body = [...macro.body]

        expandMacros(body, closure, annotations, [...callStack, name], result, false)

        var limitLength = (text: string) => {
            if (text.length > 50) {
                return text.substr(0, 50) + "..."
            } else {
                return text
            }
        }
        if (root) result.annotations.push({ text: `  Expands to ${limitLength(body.map(v => v.text).join(" "))}`, span: position })

        if (target instanceof Array) {
            target.push(...body)
            return startOffset
        } else {
            source.splice(sourceOffset, 0, ...body)
            return sourceOffset + body.length - 1
        }
    }

    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i]
        if (token.type == "macro") {
            i = expandMacro(null, tokens, i, scope, result, callStack)
        } else if (token.type == "macroArgStart" || token.type == "macroArgEnd") {
            result.errors.push({ text: `Unexpected character, not valid outside macro argument`, span: token.span })
        }
    }
}

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

const conditionTargets = {
    a: 0,
    b: 0,
    c: 0,
    C: 0,
    Z: 0
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

export function encodeHTML(text: string) {
    return text.split("").map(v => "&#" + v.charCodeAt(0) + ";").join("")
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
                    pushStatement({
                        type: "constant",
                        literal: literal,
                        span: literal.span
                    } as Statements.IConstantStatement)
                }
            }
        } else {
            result.errors.push({ text: "Unexpected token", span: token.span })
        }
    }

    return result
}

export function assemble(code: string) {
    var result = parse(code)

    return result
}