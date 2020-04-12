# s9b Compiler
[For syntax reference click here](https://docs.google.com/document/d/1dtaiE3cFVEMRPcFcRj9J7qFBcRg2qIl3E16tZRDiKfA/edit#heading=h.3bd6tbg30wck)
````typescript
import { assemble } from 's9b-compiler'

var code = `
    a = 5
    b = 10
    out = sum
    !done
`

var output = assemble(code)

var ok = output.errors.length > 0
if (!ok) {
    output.errors.forEach(v => `${console.log(v.text)} at ${v.span.from.line + 1}:${v.span.from.ch}`)
} else {
    let machineCode = output.binOut
}

````
