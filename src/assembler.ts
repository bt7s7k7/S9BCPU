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

export interface IAssembledOutput {
    error: {
        text: string,
        position: IPos
    } | null,
    binOut: number[],
    symbols: ISymbol[]
}

type TokenType = "label" | "reference" | "location" | "number" | "movement" | "string" | "condition" | "action"

export interface ITokenizationResult {
    error: {
        text: string,
        position: IPos
    } | null,
    tokens: IToken[]
}

export interface IToken {
    text: string,
    pos: IPos,
    type: TokenType
}

export function tokenize(code: string) {
    var result = {
        error: null,
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

    var stringValue = ""

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

    var pushToken = (type: TokenType) => result.tokens.push({
        pos: makePos(),
        text: matchText!,
        type: type
    })
    var lastPosition = -1
    while (position < code.length) {
        if (lastPosition == position) throw new Error(`Infinite loop in tokenizer at ${ch}:${line}`)
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
        } else if (match(/^(0[xb])?[0-9]+/)) { // Number
            pushToken("number")
        } else if (match(/^[a-z]+/)) { // Location
            pushToken("location")
        } else if (match(/^=/)) { // Movement
            pushToken("movement")
        } else if (match(/^\?!?\|?[abcCZ]+/)) { // Condition
            pushToken("condition")
        } else if (match(/^(!((halt)|(pause)|(done))|([!+-<>][abcd]))/)) { // Action
            pushToken("action")
        } else if (eatSpace()) { // Whitespace

        } else {
            result.error = {
                position: makePos(),
                text: `Unexpected character at ${line + 1}:${ch}`
            }
            return result
        }
    }

    if (blockComment) {
        result.error = {
            position: makePos(),
            text: `Unterminated block comment`
        }
        return result
    }

    if (inString) {
        result.error = {
            position: makePos(),
            text: `Unterminated string`
        }
        return result
    }

    return result
}

