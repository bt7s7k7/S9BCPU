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

export interface ITokenizationResult {
    errors: IAssemblerMessage[],
    tokens: IToken[],
    annotations: IAssemblerMessage[]
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
    pc: 0,
    stack: 0,
    mem: 0,
    stack$: 0,
    mem$: 0,
    $: 0,
    $0: 0
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
        annotations: []
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
    var macroArgsGroup = false
    var macroArgs: IToken[][] | null = null

    var stringValue = ""
    var currMacro: IMacro | null = null
    var rootMacroScope = { macros: {}, parent: null } as IMacroScope
    var macroName = ""
    var macroPos = makePos()

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
            } else if (macroArgs) {
                if (macroArgsGroup) {
                    macroArgs[macroArgs.length - 1].push(token)
                } else {
                    macroArgs.push([token])
                }
            } else {
                result.tokens.push(token)
            }
        }
    }

    var annotations: { [index: string]: IAssemblerMessage } = {}

    var expandMacro = (name: string, args: IToken[][], scope: IMacroScope, position: ISpan, callStack: string[] = []) => {
        if (callStack.includes(name)) {
            result.errors.push({
                text: `Cannot expand macros ${name} recursively at ${position.from.line + 1}:${position.from.ch}`,
                span: position
            })
            return
        }
        var findMacro = (name: string, scope: IMacroScope): IMacro | null => {
            if (name in scope.macros) {
                return scope.macros[name]
            } else {
                return scope.parent ? findMacro(name, scope.parent) : null
            }
        }

        var macroNotFound = (name: string, pos: ISpan) => result.errors.push({
            text: `Macro ${name} not found at ${pos.from.line + 1}:${pos.from.ch}`,
            span: pos
        })

        var macro = findMacro(name, scope)
        if (!macro) {
            macroNotFound(name, position)
            return
        }

        if (args.length != macro.arguments.length) {
            result.errors.push({
                text: `Macro ${name} requires ${macro.arguments.length} arguments [${macro.arguments.join(", ")}] but ${args.length} provided at ${line + 1}:${ch}`,
                span: position
            })
            return
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

        var output = result.tokens

        if (macroArgs) {
            if (macroArgsGroup) {
                output = macroArgs[macroArgs.length - 1]
            } else {
                output = []
                macroArgs.push(output)
            }
        }

        var localMacroArgs: IToken[][] | null = null
        var localMacroArgsGroup = false
        var localMacroName = ""
        var ignoreNext = false
        var start = output.length

        macro.body.forEach((v, i) => {
            if (ignoreNext) {
                ignoreNext = false
                return
            }

            if (v.type == "macro") {
                if (macro!.body[i + 1]?.type == "macroArgStart") {
                    localMacroArgs = []
                    localMacroName = v.text
                    ignoreNext = true
                } else {
                    expandMacro(v.text, [], closure, v.span, [...callStack, name])
                }
            } else if (v.type == "macroArgStart") {
                if (localMacroArgs) {
                    if (localMacroArgsGroup) {
                        result.errors.push({
                            text: `Cannot start a argument group in a group at ${v.span.from.line + 1}:${v.span.from.ch}`,
                            span: v.span
                        })
                    } else {
                        localMacroArgsGroup = true
                        localMacroArgs.push([])
                    }
                } else {
                    result.errors.push({
                        text: `Unexpected '(', they can only be used after a macro, at ${v.span.from.line + 1}:${v.span.from.ch}`,
                        span: v.span
                    })
                }
            } else if (v.type == "macroArgEnd") {
                if (localMacroArgs) {
                    if (localMacroArgsGroup) {
                        localMacroArgsGroup = false
                    } else {
                        expandMacro(localMacroName, localMacroArgs, closure, v.span, [...callStack, name])
                        localMacroArgs = null
                    }
                } else {
                    result.errors.push({
                        text: `Unexpected ')', they can only be used to stop macro argument or group, at ${v.span.from.line + 1}:${v.span.from.ch}`,
                        span: v.span
                    })
                }
            } else {
                if (localMacroArgs) {
                    localMacroArgs.push([v])
                } else {
                    output.push(v)
                }
            }
        })

        if (localMacroArgs) {
            result.errors.push({
                span: macro.body[macro.body.length - 1].span,
                text: `Unterminated macro args`
            })
        }

        var expandsTo = output.slice(start).map(v => v.text).join(" ")

        if (callStack.length == 0) result.annotations.push({ text: `  Expands to: ${expandsTo}`, span: position })
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
        }

        if (lineComment) {
            if (next()) lineComment = false
        }

        if (inString) {
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
            continue
        }
        if (match(/^"/)) {
            inString = true
            continue
        }
        if (match(/^\/\*/)) {
            blockComment = true
            continue
        }

        if (match(/^\/\//)) {
            lineComment = true
            continue
        } else if (match(/^\w+:/)) { // Label
            pushToken("label")
        } else if (match(/^:\w+/)) { // Reference
            pushToken("reference")
        } else if (match(/^(((0[xb])?[0-9]+)|('.))/)) { // Number
            pushToken("number")
        } else if (match(/^[a-z]+/)) { // Location
            if (validLocations.includes(matchText!)) pushToken("location")
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
            if (declareHead || declareBody) {
                pushToken("macro")
            } else {
                var name = matchText!
                var pos = makePos()
                if (match(/^\(/)) {
                    macroArgs = []
                    macroName = name
                    macroPos = pos
                } else {
                    expandMacro(name, [], rootMacroScope, pos)
                }
            }
        } else if ((declareBody || (macroArgs && !macroArgsGroup)) && match(/^\(/)) {
            if (declareBody) {
                pushToken("macroArgStart")
            } else if (macroArgs && !macroArgsGroup) {
                macroArgsGroup = true
                macroArgs.push([])
            }
        } else if ((declareBody || macroArgs) && match(/^\)/)) {
            if (declareBody) {
                pushToken("macroArgEnd")
            } else if (macroArgs) {
                if (macroArgsGroup) {
                    macroArgsGroup = false
                } else {
                    var args = macroArgs
                    macroArgs = null
                    expandMacro(macroName, args, rootMacroScope, macroPos)
                }
            }
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

    if (macroArgs) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated macro args`
        })
    }

    return result
}

export function assemble(code: string) {
    var result = {
        ...tokenize(code),
        binOut: [],
        symbols: []
    } as IAssembledOutput

    return result
}