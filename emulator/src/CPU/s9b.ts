import { CPU, IExecutionResult, Register, ActionRegister, Combinator } from "./base"

export class S9BCPU extends CPU {
    public components = {
        busBuffer: new Register("Bus Buffer"),
        aRegister: new ActionRegister("A Register", this.wordSize),
        bRegister: new ActionRegister("B Register", this.wordSize),
        cRegister: new ActionRegister("C Register", this.wordSize),
        dRegister: new ActionRegister("D Register", this.wordSize),
        adder: new Combinator("Adder", this.wordSize, "aRegister", "bRegister", (a, b) => a + b),
        subtractor: new Combinator("Subtractor", this.wordSize, "aRegister", "bRegister", (a, b) => a - b),
        and: new Combinator("Bitwise AND", this.wordSize, "aRegister", "bRegister", (a, b) => a & b),
        or: new Combinator("Bitwise OR", this.wordSize, "aRegister", "bRegister", (a, b) => a | b),
        xor: new Combinator("Bitwise XOR", this.wordSize, "aRegister", "bRegister", (a, b) => a ^ b),
        pc: new Register("PC"),
        mRegister: new Register("M Register"),
        nRegister: new Register("N Register"),
        stackRegister: new ActionRegister("Stack Register", this.wordSize),
        stackReadAddress: new Combinator("Stack Read Address", this.wordSize, "stackRegister", "mRegister", (a, b) => a + b),
        stackWriteAddress: new Combinator("Stack Write Address", this.wordSize, "stackRegister", "nRegister", (a, b) => a + b),
        memoryBuffer: new Register("Memory Buffer"),
    }

    public tick(): IExecutionResult {
        var result = {
            messages: []
        } as IExecutionResult

        return result
    }

    public constructor(protected wordSize: number) { super() }

}