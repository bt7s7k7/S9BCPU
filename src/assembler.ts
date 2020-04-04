import { Position } from 'codemirror';

export interface IPos extends Position {
    offset: number,
    source: string
}

export interface ISymbol {
    label: string,
    position: Position,
    address: number
}

interface IAssemblerError {
    text: string;
    position: IPos;
}

export interface IAssembledOutput {
    errors: IAssemblerError[],
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
    errors: IAssemblerError[],
    tokens: IToken[]
}

export interface IToken {
    text: string,
    pos: IPos,
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
        tokens: []
    } as ITokenizationResult

    var position = 0
    var line = 0
    var ch = 0

    var makePos = () => ({
        ch,
        line,
        offset: position,
        source: code
    } as IPos)

    var inString = false
    var blockComment = false
    var lineComment = false
    var declareHead = false
    var declareBody = false
    var macroArgs: IToken[][] | null = null
    var macroName = ""
    var macroArgsGroup = false

    var stringValue = ""
    var currMacro: IMacro | null = null
    var rootMacroScope = { macros: {}, parent: null } as IMacroScope

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
                    position: makePos()
                })
            } else {
                if (!currMacro) throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`)
                if (!currMacro.name) currMacro.name = matchText
                else currMacro.arguments.push(matchText)
            }

        } else {
            let token = {
                pos: makePos(),
                text: matchText,
                type: type
            }
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

    var expandMacro = (name: string, args: IToken[][], scope: IMacroScope) => {
        var findMacro = (name: string, scope: IMacroScope): IMacro | null => {
            if (name in scope.macros) {
                return scope.macros[name]
            } else {
                return scope.parent ? findMacro(name, scope.parent) : null
            }
        }

        var macroNotFound = (name: string, pos: IPos) => result.errors.push({
            text: `Macro ${name} not found at ${pos.line + 1}:${pos.ch}`,
            position: pos
        })

        var macro = findMacro(name, scope)
        if (!macro) {
            macroNotFound(name, makePos())
            return
        }

        if (args.length != macro.arguments.length) {
            result.errors.push({
                text: `Macro ${name} requires ${macro.arguments.length} arguments [${macro.arguments.join(", ")}] but ${args.length} provided at ${line + 1}:${ch}`,
                position: makePos()
            })
            return
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

        var macroArgs: IToken[][] | null = null
        var macroArgsGroup = false
        var macroName = ""
        var ignoreNext = false

        macro.body.forEach((v, i) => {
            if (ignoreNext) {
                ignoreNext = false
                return
            }

            if (v.type == "macro") {
                if (macro!.body[i + 1]?.type == "macroArgStart") {
                    macroArgs = []
                    macroName = v.text
                    ignoreNext = true
                } else {
                    expandMacro(v.text, [], closure)
                }
            } else if (v.type == "macroArgStart") {
                if (macroArgs) {
                    if (macroArgsGroup) {
                        result.errors.push({
                            text: `Cannot start a argument group in a group at ${v.pos.line + 1}:${v.pos.ch}`,
                            position: v.pos
                        })
                    } else {
                        macroArgsGroup = true
                        macroArgs.push([])
                    }
                } else {
                    result.errors.push({
                        text: `Unexpected '(', they can only be used after a macro, at ${v.pos.line + 1}:${v.pos.ch}`,
                        position: v.pos
                    })
                }
            } else if (v.type == "macroArgEnd") {
                if (macroArgs) {
                    if (macroArgsGroup) {
                        macroArgsGroup = false
                    } else {
                        expandMacro(macroName, macroArgs, closure)
                        macroArgs = null
                    }
                } else {
                    result.errors.push({
                        text: `Unexpected ')', they can only be used to stop macro argument or group, at ${v.pos.line + 1}:${v.pos.ch}`,
                        position: v.pos
                    })
                }
            } else {
                if (macroArgs) {
                    macroArgs.push([v])
                } else {
                    result.tokens.push(v)
                }
            }
        })
    }

    var lastPosition = -1
    while (position < code.length) {
        if (lastPosition == position) throw new Error(`Infinite loop in tokenizer at ${position} ${line + 1}:${ch}`)
        lastPosition = position
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
                    pos: makePos(),
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
                position: makePos(),
                text: `Unknown location ${matchText} at ${line + 1}:${ch}`
            })
        } else if (declareHead && match(/^\{/)) {
            if (!currMacro) throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`)
            declareHead = false
            declareBody = true
            if (!currMacro.name) {
                result.errors.push({
                    text: `No name set in define at ${line + 1}:${ch}`,
                    position: makePos()
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
                macroName = matchText!
                if (match(/^\(/)) {
                    macroArgs = []
                } else {
                    expandMacro(matchText!, [], rootMacroScope)
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
                    expandMacro(macroName, macroArgs, rootMacroScope)
                    macroArgs = null
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
                position: makePos(),
                text: `Unexpected character at ${line + 1}:${ch}`
            })
            next()
        }
    }

    if (blockComment) {
        result.errors.push({
            position: makePos(),
            text: `Unterminated block comment`
        })
    }

    if (inString) {
        result.errors.push({
            position: makePos(),
            text: `Unterminated string`
        })
    }

    return result
}

