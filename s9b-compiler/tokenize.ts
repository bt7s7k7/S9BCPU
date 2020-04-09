import { findBestMatch } from "string-similarity";
import { IAssemblerMessage } from "./assembler"
import { expandMacros, IMacroScope, IMacro } from './macroExpansion';
import { VALID_ACTIONS, VALID_LOCATIONS, ACTIONS } from './constants';

interface IPosition {
    ch: number;
    line: number;
}

/** Start and end positions of an element */
export interface ISpan {
    from: IPosition
    to: IPosition
    source: string
}

export type TokenType = "label"
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
    /** For helpful tips and info */
    annotations: IAssemblerMessage[],
    rootMacroScope: IMacroScope
}

export interface IToken {
    text: string,
    span: ISpan,
    type: TokenType
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

    /** Returns the span of the current token */
    var makeSpan = () => ({
        from: lastPositionObject,
        to: { ch, line },
        source: code
    } as ISpan)

    // State variables, could probably be replaced by a single enum
    var inString = false
    var blockComment = false
    var lineComment = false
    var declareHead = false
    var declareBody = false

    var stringValue = ""
    var currMacro: IMacro | null = null
    var rootMacroScope = result.rootMacroScope

    /** The last matched text, if any */
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

    /** Goes to the next character in the source code, handles newlines and returns true on newline */
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
            // In a declare heading we set name and arguments
            if (type != "macro") {
                result.errors.push({
                    text: `Declare header can only contain the name of the macro and arguments at ${line + 1}:${ch}`,
                    span: makeSpan()
                })
            } else {
                if (!currMacro) throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`)
                if (!currMacro.name) currMacro.name = matchText
                else currMacro.arguments.push(matchText)
            }
        } else {
            let token = {
                span: makeSpan(),
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

    /** Last position, checked to terminate infinite loops */
    var lastPosition = -1
    var lastPositionObject = { ch, line } as IPosition
    while (position < code.length) {
        // Infinite loop terminator
        if (lastPosition == position) throw new Error(`Infinite loop in tokenizer at ${position} ${line + 1}:${ch}`)
        lastPosition = position
        lastPositionObject = { ch, line }

        if (blockComment) { // Waiting for block comment to end
            if (match(/^\*\//)) {
                blockComment = false
            } else {
                next()
            }
        } else if (lineComment) { // Waiting for a line comment to end
            if (next()) lineComment = false
        } else if (inString) { // String handling
            if (match(/^\\(["n]|[\da-fA-F]{2})/)) { // Escape codes
                if (matchText == "\\\"") {
                    stringValue += `"`
                } else if (matchText == "\\n") {
                    stringValue += "\n"
                } else { // Hexadecimal character escape sequece eg. "\20"
                    stringValue += String.fromCharCode(parseInt(matchText!.substr(1), 16))
                }
            } else if (match(/^"/)) { // Detect end of string
                inString = false
                result.tokens.push({ // Write the string
                    span: makeSpan(),
                    text: stringValue + "\x00", // Text is the string content
                    type: "string"
                })
                stringValue = ""
            } else { // If not special character, append the character to the string value
                stringValue += code[position]
                next()
            }
        } else if (match(/^"/)) { // String start
            inString = true
        } else if (match(/^\/\*/)) { // Block comment start
            blockComment = true
        } else if (match(/^\/\//)) { // Line comment start
            lineComment = true
        } else if (match(/^\w+:/)) { // Label
            pushToken("label")
        } else if (match(/^:\w+/)) { // Reference
            pushToken("reference")
        } else if (match(/^(((0[xb])?[0-9]+)|('.))/)) { // Number
            pushToken("number")
        } else if (match(/^[a-z]+/)) { // Location
            // Test if the location is valid
            if (VALID_LOCATIONS.includes(matchText!)) pushToken("location")
            else {
                // Find close matches to help
                var alts = findBestMatch(matchText!, VALID_LOCATIONS).ratings.filter(v => v.rating > 0.5).sort((a, b) => b.rating - a.rating).map(v => v.target)

                result.errors.push({
                    span: makeSpan(),
                    text: `Unknown location ${matchText} at ${line + 1}:${ch} ${alts.length > 0 ? `\n  Did you mean ${alts.slice(0, 4).join(", ")}` : ""}`
                })
            }
        } else if (declareHead && match(/^\{/)) { // Macro declaration body start
            if (!currMacro) throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`)
            declareHead = false
            declareBody = true
            if (!currMacro.name) {
                result.errors.push({
                    text: `No name set in define at ${line + 1}:${ch}`,
                    span: makeSpan()
                })
            }
        } else if (declareBody && match(/^\}/)) { // Macro declaration end
            if (!currMacro) throw new Error(`No current macro set but is inside definition at ${line + 1}:${ch}`)
            rootMacroScope.macros[currMacro.name] = currMacro
            declareBody = false
            currMacro = null
        } else if (match(/^#push/)) { // Label scope block start
            pushToken("scopePush")
        } else if (match(/^#pop/)) { // Label scope block end
            pushToken("scopePop")
        } else if (match(/^=/)) { // Movement
            pushToken("movement")
        } else if (match(/^\?!?\|?[abcCZ]+/)) { // Condition
            pushToken("condition")
        } else if (match(/^![a-z]+/)) { // Action
            // Remove the leading "!"
            let actionName = matchText!.substr(1)
            // Test if action exists
            if (actionName in ACTIONS) {
                pushToken("action")
            } else {
                // Find close matches to help
                var alts = findBestMatch(matchText!, VALID_ACTIONS).ratings.filter(v => v.rating > 0.5).sort((a, b) => b.rating - a.rating).map(v => v.target)

                result.errors.push({
                    span: makeSpan(),
                    text: `Unknown action ${matchText} at ${line + 1}:${ch} ${alts.length > 0 ? `\n  Did you mean ${alts.slice(0, 4).join(", ")}` : ""}`
                })
            }
        } else if (match(/^[!+-<>][abcd]/)) { // Register action
            pushToken("registerAction")
        } else if (match(/^\[/)) { // Array start
            pushToken("arrayStart")
        } else if (match(/^\]/)) { // Array end
            pushToken("arrayEnd")
        } else if (match(/^~/)) { // Array length
            pushToken("arrayLength")
        } else if (match(/^[A-Z\d_]+/)) { // Macro call
            pushToken("macro")
        } else if (match(/^\(/)) { // Macro call arguments start
            pushToken("macroArgStart")
        } else if (match(/^\)/)) { // Macro call arguments end
            pushToken("macroArgEnd")
        } else if (match(/^#define/)) { // Macro definition start
            declareHead = true
            currMacro = {
                name: "",
                arguments: [],
                body: []
            }
        } else if (eatSpace()) { // Whitespace
            // Do nothing on whitespace
        } else { // If nothing matches the character is wrong
            result.errors.push({
                span: makeSpan(),
                text: `Unexpected character at ${line + 1}:${ch}`
            })
            next()
        }
    }

    // Test for unterminated blocks
    if (blockComment) { 
        result.errors.push({
            span: makeSpan(),
            text: `Unterminated block comment`
        })
    }

    if (inString) {
        result.errors.push({
            span: makeSpan(),
            text: `Unterminated string`
        })
    }

    if (declareHead) {
        result.errors.push({
            span: makeSpan(),
            text: `Unterminated declare header`
        })
    }

    if (declareBody) {
        result.errors.push({
            span: makeSpan(),
            text: `Unterminated declare body`
        })
    }

    expandMacros(result.tokens, result.rootMacroScope, {}, [], result, true)

    return result
}

