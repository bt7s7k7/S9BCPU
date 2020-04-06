export function encodeHTML(text: string) {
    return text.split("").map(v => "&#" + v.charCodeAt(0) + ";").join("");
}
