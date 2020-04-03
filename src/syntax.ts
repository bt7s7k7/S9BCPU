import { defineMode, Mode, commands } from "codemirror"

export interface ITokenizerState {
    lineComment: boolean,
    blockComment: boolean,
    string: boolean
}

defineMode("sasm", (config) => {
    return {
        name: "sasm",
        startState: () => ({
            blockComment: false,
            lineComment: false,
            string: false
        }),
        copyState: (v) => Object.assign({}, v),
        token(stream, state) {
            if (state.string) {
                if (stream.match(/^\\(["n]|[\da-fA-F]{2})/)) {
                    
                } else if (stream.match("\"")) {
                    state.string = false
                } else stream.next()
                return "string"
            }
            if (stream.match("\"")) {
                state.string = true
                return "string"
            }
            if (state.blockComment) {
                if (stream.match(/^\*\//)) {
                    state.blockComment = false
                } else {
                    stream.next()
                }
                return "comment"
            }
            if (stream.match(/^\/\*/)) {
                state.blockComment = true
                return "comment"
            }

            if (stream.match(/^\/\//)) {
                stream.skipToEnd()
                return "comment"
            }
            if (stream.match(/^\w+:/)) return "meta"
            if (stream.match(/^:\w+/)) return "variable"
            if (stream.match(/^(0[xb])?[0-9]+/)) return "number"
            if (stream.match(/^[a-z]/)) return "keyword"
            if (stream.match(/^=/)) return "operator"
            if (stream.match(/^\?!?\|?[abcCZ]+/)) return "condition"
            if (stream.match(/^!((halt)|(pause)|(done))|([!+-<>][abcd])/)) return "action"
            if (stream.eatSpace()) return null


            if (stream.next()) return "error"

        }
    } as Mode<ITokenizerState>
})