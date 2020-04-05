import { Position } from 'codemirror';

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

export interface IAssembledOutput extends ITokenizationResult {
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

const sourceLocations: { [index: string]: number } = {
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

const destinationLocations: { [index: string]: number } = {
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

const validLocations = [...Object.keys(sourceLocations), ...Object.keys(destinationLocations)]

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
            if (validLocations.includes(matchText!) || validLocations.includes(matchText! + "$")) pushToken("location")
            else result.errors.push({
                span: makePos(),
                text: `Unknown location ${matchText} at ${line + 1}:${ch}`
            })
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
        } else if (match(/^(!((halt)|(pause)|(done))|([!+-<>][abcd]))/)) { // Action
            pushToken("action")
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
        if (root) result.annotations.push({ text: `  Expands to ${limitLength(body.map(v=>v.text).join(" "))}`, span: position })

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

export function assemble(code: string) {
    var result = {
        ...tokenize(code),
        binOut: [],
        symbols: []
    } as IAssembledOutput

    expandMacros(result.tokens, result.rootMacroScope, {}, [], result, true)

    return result
}