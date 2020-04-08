import { ISpan } from './tokenize';
import { IParseResult, parse } from './parser';


export interface ISymbol {
    label: string,
    position: ISpan,
    address: number
}

export interface IAssemblerMessage {
    text: string;
    span: ISpan;
}

export interface IAssembledOutput extends IParseResult {
    binOut: number[],
    symbols: ISymbol[]
}




export function assemble(code: string) {
    var result = parse(code)

    return result
}