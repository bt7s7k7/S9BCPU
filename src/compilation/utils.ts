/** Encodes text to make it HTML friendly */
export function encodeHTML(text: string) {
    return text.split("").map(v => "&#" + v.charCodeAt(0) + ";").join("")
}
