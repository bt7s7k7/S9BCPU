export abstract class Component {
    protected lastState = " "
    protected labelColor = "white"

    public getInfo(insert = "") {
        return `<div class="row"><div class="grow"><code>[${this.lastState}]</code> ${this.label.fontcolor(this.labelColor)}</div>${insert}</div>`
    }

    public reset() { }

    public update() {
        this.lastState = " "
    }

    public constructor(public label: string) { }
}

export abstract class CPU {
    public running = false
    public skipFlag = false
    public zeroFlag = false
    public carryFlag = false
    public state = "bootstrap"
    public components = {} as Record<string, Component>

    public abstract tick(): IExecutionResult

    public getInfo() {
        var indicator = (label: string, value: boolean) => label.fontcolor(value ? "lightgreen" : "red")
        return [
            `<div>${indicator("R", this.running)} ${indicator("S", this.skipFlag)} ${indicator("Z", this.zeroFlag)} ${indicator("C", this.carryFlag)} ${this.state.fontcolor("grey")}</div>`,
            ...Object.values(this.components).map(v=>v.getInfo())
        ].join("\n")
    }
}

export interface IExecutionResult {
    messages: string[]
}

export class Register extends Component {
    protected value = 0
    protected labelColor = "lightgreen"

    public setValue(value: number) {
        this.lastState = "W".fontcolor("cyan")
        this.value = value
    }
    
    public getValue() {
        this.lastState = "R".fontcolor("orange")
        return this.value
    }

    public reset() { super.reset(); this.value = 0 }

    public getInfo() {
        return super.getInfo(`<div>${this.value.toString().fontcolor("crimson")}</div>`)
    }
}

export class Combinator extends Component {
    public labelColor = "skyblue"

    public constructor(label: string, protected wordSize: number, protected a: string, protected b: string, protected operation: (a: number, b: number) => number) {
        super(label)
    }
    public getValue(cpu: CPU) { 
        this.lastState = "R".fontcolor("orange")
        var aReg = cpu.components[this.a] as Register
        var bReg = cpu.components[this.b] as Register
        var result = this.operation(aReg.getValue(), bReg.getValue())

        cpu.carryFlag = false
        if (result >= this.wordSize || result < 0) {
            result &= this.wordSize - 1
            cpu.carryFlag = true
        }

        cpu.zeroFlag = result == 0

        return result
    }
}

export class ActionRegister extends Register {
    public labelColor = "lightsalmon"

    public increment() {
        this.value++
        this.lastState = "+".fontcolor("lightgreen")
        if (this.value >= this.wordSize) {
            this.value = this.value & (this.wordSize - 1)
        }
    }

    public decrement() {
        this.value--
        this.lastState = "-".fontcolor("lightgreen")
        if (this.value <= 0) {
            this.value = this.value & (this.wordSize - 1)
        }
    }

    public invert() {
        this.value = ~this.value
    }

    public shiftLeft() {
        this.value <<= 1
        this.lastState = "<".fontcolor("lightgreen")
        if (this.value >= this.wordSize) {
            this.value = this.value & (this.wordSize - 1)
        }
    }
    
    public shiftRight() {
        this.value <<= 1
        this.lastState = "<".fontcolor("lightgreen")
        if (this.value >= this.wordSize) {
            this.value = this.value & (this.wordSize - 1)
        }
    }

    public constructor(label: string, protected wordSize: number) { super(label) }
}