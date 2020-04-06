import { IToken, ITokenizationResult } from './tokenize'
import { IAssemblerMessage } from './assembler'

export interface IMacro {
    name: string,
    arguments: string[],
    body: IToken[]
}

export interface IMacroScope {
    macros: { [index: string]: IMacro },
    parent: IMacroScope | null
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

