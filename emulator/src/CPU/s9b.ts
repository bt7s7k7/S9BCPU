import { ACTION_TARGET_SPAN, ACTION_TYPE_SPAN, CONDITION_INVERT, CONDITION_OR, CONDITION_TARGETS, DESTINATION_LOCATIONS, DESTINATION_LOCATION_SPAN, INST_TYPE, INV_ACTIONS, INV_DESTINATION_LOCATION, INV_REGISTER_ACTIONS, INV_REGISTER_ACTION_REGISTERS, INV_SOURCE_LOCATION, SOURCE_LOCATIONS, SOURCE_LOCATION_SPAN } from 's9b-compiler'
import { ActionRegister, Combinator, Component, CPU, IExecutionResult, Memory, Register } from "./base"

export class S9BCPU extends CPU {
    public components = {
        busBuffer: new Register("Bus Buffer"),
        instBuffer: new Register("Instruction Buffer"),
        aRegister: new ActionRegister("A Register", this.wordSize),
        bRegister: new ActionRegister("B Register", this.wordSize),
        cRegister: new ActionRegister("C Register", this.wordSize),
        dRegister: new ActionRegister("D Register", this.wordSize),
        adder: new Combinator("Adder", this.wordSize, "aRegister", "bRegister", (a, b) => a + b, true),
        subtractor: new Combinator("Subtractor", this.wordSize, "aRegister", "bRegister", (a, b) => a - b, true),
        and: new Combinator("Bitwise AND", this.wordSize, "aRegister", "bRegister", (a, b) => a & b),
        or: new Combinator("Bitwise OR", this.wordSize, "aRegister", "bRegister", (a, b) => a | b),
        xor: new Combinator("Bitwise XOR", this.wordSize, "aRegister", "bRegister", (a, b) => a ^ b),
        pc: new ActionRegister("PC", this.wordSize),
        mRegister: new Register("M Register"),
        nRegister: new Register("N Register"),
        stackRegister: new ActionRegister("Stack Register", this.wordSize),
        stackReadAddress: new Combinator("Stack Read Address", this.wordSize, "stackRegister", "mRegister", (a, b) => a + b),
        stackWriteAddress: new Combinator("Stack Write Address", this.wordSize, "stackRegister", "nRegister", (a, b) => a + b),
        memoryBuffer: new Register("Memory Buffer"),
        memory: new Memory("Memory", 256)
    }

    public tick(): IExecutionResult {
        Object.values(this.components).forEach(v => v.update())

        var result = {
            messages: []
        } as IExecutionResult

        if (!this.running) return result

        switch (this.state) {
            case "reset": {
                this.components.pc.setValue(0)
                this.components.stackRegister.setValue(255)
                this.state = "fetch"
                result.messages.push("[OUT] Reset")
                break
            }
            case "fetch": {
                const address = this.components.pc.getValue()
                const inst = this.components.memory.getValue(address)
                this.components.instBuffer.setValue(inst)
                let type = ""
                if (this.skipFlag) {
                    let amount = 0

                    if ((inst & INST_TYPE.movement) > 0) {
                        if (INV_SOURCE_LOCATION[inst & SOURCE_LOCATION_SPAN].includes("$")) amount++
                        if (INV_DESTINATION_LOCATION[inst & DESTINATION_LOCATION_SPAN].includes("$")) amount++
                    }

                    if (amount == 0) {
                        this.state = "finish"
                    } else if (amount == 1) {
                        this.state = "skip1"
                    } else if (amount == 2) {
                        this.state = "skip2"
                    }

                    this.skipFlag = false

                    type = "skipped"
                } else {
                    if ((inst & INST_TYPE.movement) > 0) {
                        this.state = "movement"
                        type = "is movement"
                    } else if ((inst & INST_TYPE.condition) > 0) {
                        this.state = "condition"
                        type = "is condition"
                    } else if ((inst & INST_TYPE.action) > 0) {
                        this.state = "action"
                        type = "is action"
                    } else {
                        this.state = "halted"
                        this.running = false
                        result.messages.push(`[ERR] Fetched inst ${inst} from ${address}, is invalid`.fontcolor("red"))
                        break
                    }
                }
                result.messages.push(`[INT] Fetched inst ${inst} from ${address}, ${type}`.fontcolor("grey"))
                break
            }
            case "skip2": {
                this.components.pc.increment(null)
                this.state = "skip1"
                break
            }
            case "skip1": {
                this.components.pc.increment(null)
                this.state = "finish"
                break
            }
            case "condition": {
                let inst = this.components.instBuffer.getValue()
                let invert = inst & CONDITION_INVERT
                let or = inst & CONDITION_OR
                let out = !or

                if (inst & CONDITION_TARGETS.a) if (or) out = out || this.components.aRegister.getValue() == 0; else out = out && this.components.aRegister.getValue() == 0;
                if (inst & CONDITION_TARGETS.b) if (or) out = out || this.components.bRegister.getValue() == 0; else out = out && this.components.bRegister.getValue() == 0;
                if (inst & CONDITION_TARGETS.c) if (or) out = out || this.components.cRegister.getValue() == 0; else out = out && this.components.cRegister.getValue() == 0;
                if (inst & CONDITION_TARGETS.C) if (or) out = out || this.carryFlag; else out = out && this.carryFlag;
                if (inst & CONDITION_TARGETS.Z) if (or) out = out || this.zeroFlag; else out = out && this.zeroFlag;

                if (invert) out = !out

                if (out) {
                    result.messages.push("[RUN] Condition met".fontcolor("lightgreen"))
                } else {
                    result.messages.push("[RUN] Condition not met".fontcolor("lightcoral"))
                    this.skipFlag = true
                }
                this.state = "finish"
                break
            }
            case "action": {
                let inst = this.components.instBuffer.getValue()

                let registerAction = INV_REGISTER_ACTIONS[inst & ACTION_TYPE_SPAN]

                if (registerAction != undefined) {
                    let target = INV_REGISTER_ACTION_REGISTERS[inst & ACTION_TARGET_SPAN]
                    let targetObject = (this.components as Record<string, Component>)[target + "Register"] as ActionRegister

                    if (registerAction == "!") targetObject.invert(this)
                    if (registerAction == "+") targetObject.increment(this)
                    if (registerAction == "-") targetObject.decrement(this)
                    if (registerAction == "<") targetObject.shiftLeft(this)
                    if (registerAction == ">") targetObject.shiftRight(this)

                    result.messages.push(`[RUN] ${registerAction + target}`)
                } else {
                    let actionCode = inst & ~INST_TYPE.action
                    let action = INV_ACTIONS[actionCode]

                    if (action == "done") {
                        this.running = false
                        this.state = "done"
                        result.messages.push("[OUT] Done")
                    } else if (action == "pause") {
                        this.running = false
                        this.state = "pause"
                        result.messages.push("[OUT] Paused")
                    } else if (action == "halt") {
                        this.running = false
                        this.state = "halted"
                        result.messages.push("[OUT] Halted")
                    } else if (action == "pop") {
                        this.components.stackRegister.increment(null)
                        this.state = "finish"
                        result.messages.push("[RUN] Popped stack")
                    }
                }

                this.state = "finish"
                break
            }
            case "done":
            case "pause": {
                this.state = "finish"
                result.messages.push("[RUN] Resumed")
                break
            }
            case "movement": {
                let inst = this.components.instBuffer.getValue()
                if (INV_SOURCE_LOCATION[inst & SOURCE_LOCATION_SPAN].includes("$")) this.state = "movement/inp_arg"
                else if (INV_DESTINATION_LOCATION[inst & DESTINATION_LOCATION_SPAN].includes("$")) this.state = "movement/out_arg"
                else this.state = "movement/fetch"
                break
            }
            case "movement/inp_arg": {
                this.components.pc.increment(null)
                this.state = "movement/inp_arg+1"
                result.messages.push("[INT] Loading input argument".fontcolor("grey"))
                break
            }
            case "movement/inp_arg+1": {
                let inst = this.components.instBuffer.getValue()
                let address = this.components.pc.getValue()
                let value = this.components.memory.getValue(address)
                this.components.mRegister.setValue(value)
                if (INV_DESTINATION_LOCATION[inst & DESTINATION_LOCATION_SPAN].includes("$")) this.state = "movement/out_arg"
                else this.state = "movement/fetch"
                result.messages.push(`[INT] Loaded ${value} into M`.fontcolor("grey"))
                break
            }
            case "movement/out_arg": {
                this.components.pc.increment(null)
                this.state = "movement/out_arg+1"
                result.messages.push("[INT] Loading output argument".fontcolor("grey"))
                break
            }
            case "movement/out_arg+1": {
                let address = this.components.pc.getValue()
                let value = this.components.memory.getValue(address)
                this.components.nRegister.setValue(value)
                this.state = "movement/fetch"
                result.messages.push(`[INT] Loaded ${value} into N`.fontcolor("grey"))
                break
            }
            case "movement/fetch": {
                let inst = this.components.instBuffer.getValue() & SOURCE_LOCATION_SPAN
                if (inst == SOURCE_LOCATIONS.mem$ || inst == SOURCE_LOCATIONS.mem) {
                    let address = this.components.mRegister.getValue()
                    let value = this.components.memory.getValue(address)
                    this.components.memoryBuffer.setValue(value)
                    result.messages.push(`Loaded value ${value} from ${address} to memory buffer`)
                } else if (inst == SOURCE_LOCATIONS.stack || inst == SOURCE_LOCATIONS.stack$) {
                    let address = this.components.stackReadAddress.getValue(this)
                    let value = this.components.memory.getValue(address)
                    this.components.memoryBuffer.setValue(value)
                    result.messages.push(`[INT] Loaded value ${value} from ${address} to memory buffer`.fontcolor("grey"))
                }
                this.state = "movement/move"
                break
            }
            case "movement/move": {
                let inst = this.components.instBuffer.getValue()
                let dest = inst & DESTINATION_LOCATION_SPAN
                let source = inst & SOURCE_LOCATION_SPAN

                let value = 0
                let from = ""

                if (source == SOURCE_LOCATIONS.mem || source == SOURCE_LOCATIONS.mem$ || source == SOURCE_LOCATIONS.stack || source == SOURCE_LOCATIONS.stack$) {
                    value = this.components.memoryBuffer.getValue()
                    from = "memory buffer"
                } else if (source == SOURCE_LOCATIONS.$) {
                    value = this.components.mRegister.getValue()
                    from = "M"
                } else if (source == SOURCE_LOCATIONS.a) {
                    value = this.components.aRegister.getValue()
                    from = "a"
                } else if (source == SOURCE_LOCATIONS.c) {
                    value = this.components.cRegister.getValue()
                    from = "c"
                } else if (source == SOURCE_LOCATIONS.d) {
                    from = "d"
                    value = this.components.cRegister.getValue()
                } else if (source == SOURCE_LOCATIONS.and) {
                    value = this.components.and.getValue(this)
                    from = "and"
                } else if (source == SOURCE_LOCATIONS.or) {
                    value = this.components.or.getValue(this)
                    from = "or"
                } else if (source == SOURCE_LOCATIONS.stackptr$) {
                    value = this.components.stackReadAddress.getValue(this)
                    from = "stack + m"
                } else if (source == SOURCE_LOCATIONS.sub) {
                    value = this.components.subtractor.getValue(this)
                    from = "sub"
                } else if (source == SOURCE_LOCATIONS.sum) {
                    value = this.components.adder.getValue(this)
                    from = "sum"
                } else if (source == SOURCE_LOCATIONS.xor) {
                    value = this.components.xor.getValue(this)
                    from = "xor"
                } else if (source == SOURCE_LOCATIONS.b) {
                    value = this.components.bRegister.getValue()
                    from = "b"
                }

                let to = ""

                if (dest == DESTINATION_LOCATIONS.a) {
                    this.components.aRegister.setValue(value)
                    to = "a"
                    this.state = "finish"
                } else if (dest == DESTINATION_LOCATIONS.mem || dest == DESTINATION_LOCATIONS.mem$ || dest == DESTINATION_LOCATIONS.stack || dest == DESTINATION_LOCATIONS.stack$) {
                    this.components.memoryBuffer.setValue(value)
                    to = "memory buffer"
                    this.state = "movement/flush"
                } else if (dest == DESTINATION_LOCATIONS.b) {
                    this.components.bRegister.setValue(value)
                    to = "b"
                    this.state = "finish"
                } else if (dest == DESTINATION_LOCATIONS.d) {
                    this.components.dRegister.setValue(value)
                    to = "d"
                    this.state = "finish"
                } else if (dest == DESTINATION_LOCATIONS.m) {
                    this.components.mRegister.setValue(value)
                    to = "m"
                    this.state = "finish"
                } else if (dest == DESTINATION_LOCATIONS.n) {
                    this.components.nRegister.setValue(value)
                    to = "n"
                    this.state = "finish"
                } else if (dest == DESTINATION_LOCATIONS.pc) {
                    this.components.pc.setValue(value)
                    to = "pc"
                    this.state = "fetch"
                } else if (dest == DESTINATION_LOCATIONS.push) {
                    this.components.memoryBuffer.setValue(value)
                    this.components.stackRegister.decrement(null)
                    this.components.nRegister.reset()
                    to = "memory buffer and stack++"
                    this.state = "movement/flush"
                } else if (dest == DESTINATION_LOCATIONS.out) {
                    result.messages.push(`<b>[OUT] Output ${value.toString().padStart(3, "\xa0")} ${value.toString(2).padStart(9, "0").replace(/1/g, "\u2588").replace(/0/g, "\xa0")}</b>`.fontcolor("yellow"))
                    to = "debug out"
                    this.state = "finish"
                } else if (dest == DESTINATION_LOCATIONS.c) {
                    this.components.cRegister.setValue(value)
                    to = "c"
                    this.state = "finish"
                }

                result.messages.push(`[RUN] Moved ${value} from ${from} to ${to}`)

                break
            }
            case "movement/flush": {
                let inst = this.components.instBuffer.getValue() & SOURCE_LOCATION_SPAN
                let dest = inst & DESTINATION_LOCATION_SPAN

                if (dest == DESTINATION_LOCATIONS.mem || dest == DESTINATION_LOCATIONS.mem$) {
                    let address = this.components.nRegister.getValue()
                    let value = this.components.memoryBuffer.getValue()
                    this.components.memory.setValue(value, address)
                    result.messages.push(`[INT] Saved value ${value} into ${address}`.fontcolor("grey"))
                } else {
                    let address = this.components.stackWriteAddress.getValue(this)
                    let value = this.components.memoryBuffer.getValue()
                    this.components.memory.setValue(value, address)
                    result.messages.push(`[INT] Saved value ${value} into stack at ${address}`.fontcolor("grey"))
                }

                this.state = "finish"
                break
            }
            case "finish": {
                this.components.pc.increment(null)
                this.state = "fetch"
                break
            }
        }
        return result
    }

    public constructor(protected wordSize: number) { super() }

}