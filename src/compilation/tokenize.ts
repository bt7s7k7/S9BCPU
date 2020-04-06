import { Position } from 'codemirror';
import { findBestMatch } from "string-similarity";
import { IAssemblerMessage } from "./assembler"
import { expandMacros, IMacroScope, IMacro } from './macroExpansion';
import { validActions, validLocations, actions } from './constants';

export interface ISpan {
    from: Position
    to: Position
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
    } as ITokenizationResult;
    var position = 0;
    var line = 0;
    var ch = 0;
    var makePos = () => ({
        from: lastPositionObject,
        to: { ch, line },
        source: code
    } as ISpan);
    var inString = false;
    var blockComment = false;
    var lineComment = false;
    var declareHead = false;
    var declareBody = false;
    var stringValue = "";
    var currMacro: IMacro | null = null;
    var rootMacroScope = result.rootMacroScope;
    var matchText: string | null = null;
    var match = (pattern: RegExp | string) => {
        var result = code.substr(position).match(pattern);
        if (result) {
            position += result[0].length;
            ch += result[0].length;
            matchText = result[0];
            return true;
        }
        else {
            matchText = null;
            return false;
        }
    };
    var next = () => {
        var char = code[position];
        if (char == "\n") {
            line++;
            ch = 0;
            position++;
            return true;
        }
        ch++;
        position++;
        return false;
    };
    var eatSpace = () => {
        if (code[position].match(/^\s/)) {
            next();
            return true;
        }
        else
            return false;
    };
    var pushToken = (type: TokenType) => {
        if (!matchText)
            throw new Error(`pushToken called without matchText being at ${line + 1}:${ch} with ${type} type`);
        if (declareHead) {
            if (type != "macro") {
                result.errors.push({
                    text: `Declare header can only contain the name of the macro and arguments at ${line + 1}:${ch}`,
                    span: makePos()
                });
            }
            else {
                if (!currMacro)
                    throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`);
                if (!currMacro.name)
                    currMacro.name = matchText;
                else
                    currMacro.arguments.push(matchText);
            }
        }
        else {
            let token = {
                span: makePos(),
                text: matchText,
                type: type
            } as IToken;
            if (declareBody) {
                if (!currMacro)
                    throw new Error(`Current macro not set inside declare body at ${line + 1}:${ch}`);
                currMacro.body.push(token);
            }
            else {
                result.tokens.push(token);
            }
        }
    };
    var lastPosition = -1;
    var lastPositionObject = { ch, line } as Position;
    while (position < code.length) {
        if (lastPosition == position)
            throw new Error(`Infinite loop in tokenizer at ${position} ${line + 1}:${ch}`);
        lastPosition = position;
        lastPositionObject = { ch, line };
        if (blockComment) {
            if (match(/^\*\//)) {
                blockComment = false;
            }
            else {
                next();
            }
        }
        else if (lineComment) {
            if (next())
                lineComment = false;
        }
        else if (inString) {
            if (match(/^\\(["n]|[\da-fA-F]{2})/)) {
                if (matchText == "\\\"") {
                    stringValue += `"`;
                }
                else if (matchText == "\\n") {
                    stringValue += "\n";
                }
                else {
                    stringValue += String.fromCharCode(parseInt(matchText!.substr(1), 16));
                }
            }
            else if (match(/^"/)) {
                inString = false;
                result.tokens.push({
                    span: makePos(),
                    text: stringValue,
                    type: "string"
                });
                stringValue = "";
            }
            else {
                stringValue += code[position];
                next();
            }
        }
        else if (match(/^"/)) {
            inString = true;
        }
        else if (match(/^\/\*/)) {
            blockComment = true;
        }
        else if (match(/^\/\//)) {
            lineComment = true;
        }
        else if (match(/^\w+:/)) { // Label
            pushToken("label");
        }
        else if (match(/^:\w+/)) { // Reference
            pushToken("reference");
        }
        else if (match(/^(((0[xb])?[0-9]+)|('.))/)) { // Number
            pushToken("number");
        }
        else if (match(/^[a-z]+/)) { // Location
            if (validLocations.includes(matchText!))
                pushToken("location");
            else {
                var alts = findBestMatch(matchText!, validLocations).ratings.filter(v => v.rating > 0.5).sort((a, b) => b.rating - a.rating).map(v => v.target);
                result.errors.push({
                    span: makePos(),
                    text: `Unknown location ${matchText} at ${line + 1}:${ch} ${alts.length > 0 ? `\n  Did you mean ${alts.slice(0, 4).join(", ")}` : ""}`
                });
            }
        }
        else if (declareHead && match(/^\{/)) {
            if (!currMacro)
                throw new Error(`Current macro not set inside declare header at ${line + 1}:${ch}`);
            declareHead = false;
            declareBody = true;
            if (!currMacro.name) {
                result.errors.push({
                    text: `No name set in define at ${line + 1}:${ch}`,
                    span: makePos()
                });
            }
        }
        else if (declareBody && match(/^\}/)) {
            if (!currMacro)
                throw new Error(`No current macro set but is inside definition at ${line + 1}:${ch}`);
            rootMacroScope.macros[currMacro.name] = currMacro;
            declareBody = false;
            currMacro = null;
        }
        else if (match(/^#push/)) {
            pushToken("scopePush");
        }
        else if (match(/^#pop/)) {
            pushToken("scopePop");
        }
        else if (match(/^=/)) { // Movement
            pushToken("movement");
        }
        else if (match(/^\?!?\|?[abcCZ]+/)) { // Condition
            pushToken("condition");
        }
        else if (match(/^![a-z]+/)) {
            let actionName = matchText!.substr(1);
            if (actionName in actions) {
                pushToken("action");
            }
            else {
                var alts = findBestMatch(matchText!, validActions).ratings.filter(v => v.rating > 0.5).sort((a, b) => b.rating - a.rating).map(v => v.target);
                result.errors.push({
                    span: makePos(),
                    text: `Unknown action ${matchText} at ${line + 1}:${ch} ${alts.length > 0 ? `\n  Did you mean ${alts.slice(0, 4).join(", ")}` : ""}`
                });
            }
        }
        else if (match(/^[!+-<>][abcd]/)) { // Register action
            pushToken("registerAction");
        }
        else if (match(/^\[/)) {
            pushToken("arrayStart");
        }
        else if (match(/^\]/)) {
            pushToken("arrayEnd");
        }
        else if (match(/^~/)) {
            pushToken("arrayLength");
        }
        else if (match(/^[A-Z\d_]+/)) {
            pushToken("macro");
        }
        else if (match(/^\(/)) {
            pushToken("macroArgStart");
        }
        else if (match(/^\)/)) {
            pushToken("macroArgEnd");
        }
        else if (match(/^#define/)) {
            declareHead = true;
            currMacro = {
                name: "",
                arguments: [],
                body: []
            };
        }
        else if (eatSpace()) { // Whitespace
        }
        else {
            result.errors.push({
                span: makePos(),
                text: `Unexpected character at ${line + 1}:${ch}`
            });
            next();
        }
    }
    if (blockComment) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated block comment`
        });
    }
    if (inString) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated string`
        });
    }
    if (declareHead) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated declare header`
        });
    }
    if (declareBody) {
        result.errors.push({
            span: makePos(),
            text: `Unterminated declare body`
        });
    }
    expandMacros(result.tokens, result.rootMacroScope, {}, [], result, true);
    return result;
}

