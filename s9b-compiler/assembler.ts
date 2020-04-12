import { ISpan } from './tokenize';
import { IParseResult, parse, Statement, ILiteral, Statements } from './parser';
import { INST_TYPE, ACTIONS, REGISTER_ACTIONS, REGISTER_ACTION_REGISTERS, CONDITION_TARGETS, CONDITION_INVERT, CONDITION_OR, SOURCE_LOCATIONS, DESTINATION_LOCATIONS } from './constants';

export interface IAssemblerMessage {
    text: string;
    span: ISpan;
}

export interface IInstruction {
    address: number
}

export interface IAssembledOutput extends IParseResult {
    binOut: number[],
    instructions: WeakMap<Statement, number>,
    lookup: Record<number, Statement>
}

export function assemble(code: string) {
    var result = {
        ...parse(code),
        binOut: [],
        instructions: new WeakMap(),
        lookup: {}
    } as IAssembledOutput

    if (result.errors.length > 0) return result

    var toLink: { address: number, statement: Statement }[] = []
    var namedData: Record<string, Statements.IConstantStatement> = {}
    let address = result.binOut.length

    let pushInstr = (code: number, statement: Statement) => {
        result.binOut[address] = code
        if (!result.instructions.has(statement)) result.instructions.set(statement, address)
        result.lookup[address] = statement
        address = result.binOut.length
    }

    for (let i = 0, len = result.statements.length; i < len; i++) {
        let statement = result.statements[i]

        if (statement.type == "action") {
            pushInstr(INST_TYPE.action | ACTIONS[statement.action], statement)
        } else if (statement.type == "registerAction") {
            pushInstr(INST_TYPE.action | REGISTER_ACTIONS[statement.action] | REGISTER_ACTION_REGISTERS[statement.target], statement)
        } else if (statement.type == "condition") {
            pushInstr(INST_TYPE.condition | statement.targets.map(v => CONDITION_TARGETS[v]).reduce((a, b) => a | b, 0) | +statement.invert * CONDITION_INVERT | +statement.or * CONDITION_OR, statement)
        } else if (statement.type == "movement") {
            if (!statement.from || !statement.to) throw new Error("Movement statement locations not set")
            pushInstr(INST_TYPE.movement | SOURCE_LOCATIONS[statement.from] | DESTINATION_LOCATIONS[statement.to], statement)

            if (statement.fromLiteral) {
                if (statement.fromLiteral.value == null) throw new Error("Statement from literal value not set")
                if (typeof statement.fromLiteral.value == "number") {
                    pushInstr(statement.fromLiteral.value, statement)
                } else {
                    toLink.push({ address, statement: statement.fromLiteral.value })
                    pushInstr(-1, statement)
                }
            }

            if (statement.toLiteral) {
                if (statement.toLiteral.value == null) throw new Error("Statement to literal value not set")
                if (typeof statement.toLiteral.value == "number") {
                    pushInstr(statement.toLiteral.value, statement)
                } else {
                    toLink.push({ address, statement: statement.toLiteral.value })
                    pushInstr(-1, statement)
                }
            }
        }
    }

    for (let i = 0; i < toLink.length; i++) {
        let curr = toLink[i]
        if (curr.statement.type == "constant") {
            let target = -1
            if (curr.statement.label && curr.statement.label in namedData) {
                let fetchedTarget = result.instructions.get(namedData[curr.statement.label])
                if (typeof fetchedTarget == "undefined") throw new Error("Saved named data is not set in instruction map")
                target = fetchedTarget
            } else {
                if (typeof curr.statement.value == "string") {
                    target = address
                    curr.statement.value.split("").forEach(v => pushInstr(v.charCodeAt(0), curr.statement))
                } else {
                    target = address
                    curr.statement.value.forEach(v => {
                        if (typeof v.value == "number") {
                            pushInstr(v.value, curr.statement)
                        } else {
                            if (!v.value) throw new Error("Unresolved reference in array")
                            toLink.push({ address, statement: v.value })
                            pushInstr(-1, curr.statement)
                        }
                    })
                }
                result.instructions.set(curr.statement, target)
                if (curr.statement.label) namedData[curr.statement.label] = curr.statement
            }

            result.binOut[curr.address] = target
        } else {
            let target = result.instructions.get(curr.statement)
            if (target == undefined) throw new Error("Statement set for linking is not in instructions: Map<Statement, number>")
            result.binOut[curr.address] = target
        }
    }

    return result
}