import * as lumos from '@ckb-lumos/base';
import * as pw from '@lay2/pw-core';

import { Script, IScript, HexString } from './';

export interface OutPoint {
  txHash: HexString;
  index: HexString;
}

export interface CellDep {
  depType: string;
  outPoint: OutPoint;
}

export interface ICell {
  capacity: string;
  lock: IScript;
  type?: IScript | null | undefined;
  data?: HexString | null | undefined;
}

export class Cell implements ICell {
  constructor(public capacity: string, public lock: Script, public type?: Script, public data?: HexString) {
    this.capacity = capacity;
    this.lock = lock;
    this.type = type;
    this.data = data;
  }

  static fromPw(pwCell: pw.Cell): Cell {
    const { capacity, lock } = pwCell;
    const data = pwCell.getHexData();
    const type = pwCell.type ? Script.fromPw(pwCell.type) : undefined;

    return new Cell(capacity.toString(), Script.fromPw(lock), type, data);
  }

  static fromJson(jsonCell: ICell): Cell {
    const { capacity, lock, data } = jsonCell;
    const type = jsonCell.type ? Script.fromJson(jsonCell.type) : undefined;

    return new Cell(capacity, Script.fromJson(lock), type, data);
  }

  static fromLumos(lumosCell: any): Cell {
    const capacity = 'cellOutput' in lumosCell ? lumosCell.cellOutput.capacity : lumosCell.cell_output.capacity;
    const lock = Script.fromLumos('cellOutput' in lumosCell ? lumosCell.cellOutput.lock : lumosCell.cell_output.lock);
    const type = (() => {
      const t = 'cellOutput' in lumosCell ? lumosCell.cellOutput.type : lumosCell.cell_output.type;
      return t ? Script.fromLumos(t) : undefined;
    })();
    const data = lumosCell.data;

    return new Cell(capacity, lock, type, data);
  }

  toPw(): pw.Cell {
    return new pw.Cell(
      new pw.Amount(this.capacity),
      this.lock.toPw(),
      this.type ? this.type.toPw() : undefined,
      undefined,
      this.data,
    );
  }

  toJson(): ICell {
    return {
      ...this,
    };
  }
}

export interface ICellInput {
  cell: ICell;
  previousOutPoint?: OutPoint;
  since?: HexString;
  blockHash?: HexString;
  blockNumber?: HexString;
}

export class CellInput implements ICellInput {
  constructor(
    public cell: Cell,
    public previousOutput?: OutPoint,
    public since?: HexString,
    public blockHash?: HexString,
    public blockNumber?: HexString,
  ) {
    this.cell = cell;
    this.previousOutput = previousOutput;
    this.since = since;
    this.blockHash = blockHash;
    this.blockNumber = blockNumber;
  }

  static fromPw(pwCell: pw.Cell): CellInput {
    const cell = Cell.fromPw(pwCell);
    const outPoint = pwCell.outPoint ? FromPw.OutPoint(pwCell.outPoint) : undefined;

    return new CellInput(cell, outPoint);
  }

  static fromJson(jsonCellInput: ICellInput): CellInput {
    return new CellInput(
      Cell.fromJson(jsonCellInput.cell),
      jsonCellInput.previousOutPoint,
      jsonCellInput.since,
      jsonCellInput.blockHash,
      jsonCellInput.blockNumber,
    );
  }

  static fromLumos(lumosCell: any, lumosInput?: lumos.Input): CellInput {
    const cell = Cell.fromLumos(lumosCell);
    const outPoint = FromLumos.outPoint('outPoint' in lumosCell ? lumosCell.outPoint : lumosCell.out_point);
    const blockHash = 'blockHash' in lumosCell ? lumosCell.blockHash : lumosCell.block_hash;
    const blockNumber = 'blockNumber' in lumosCell ? lumosCell.blockNumber : lumosCell.block_number;
    const since = lumosInput ? lumosInput.since : undefined;

    return new CellInput(cell, outPoint, since, blockHash, blockNumber);
  }

  toPw(): pw.Cell {
    const { capacity, lock, type, data } = this.cell;
    const outPoint = ToPw.outPoint(this.previousOutput);

    return new pw.Cell(new pw.Amount(capacity), lock.toPw(), type ? type.toPw() : undefined, outPoint, data);
  }

  toJson(): ICellInput {
    return {
      ...this,
    };
  }
}

export interface WitnessArgs {
  inputType?: HexString | null | undefined;
  lock?: HexString | null | undefined;
  outputType?: HexString | null | undefined;
}

export interface ITransaction {
  cellDeps: CellDep[] | null | undefined;
  headerDeps: HexString[] | null | undefined;
  inputs: ICellInput[];
  outputs: ICell[];
  witnesses: HexString[];
  version: HexString;
  hash?: HexString | null | undefined;
  witnessArgs?: WitnessArgs[] | null | undefined;
}

export default class Transaction implements ITransaction {
  constructor(
    public inputs: CellInput[],
    public outputs: Cell[],
    public witnesses: HexString[],
    public cellDeps: CellDep[],
    public headerDeps: HexString[],
    public version: HexString,
    public hash?: HexString,
    public witnessArgs?: WitnessArgs[],
  ) {
    this.cellDeps = cellDeps;
    this.headerDeps = headerDeps;
    this.inputs = inputs;
    this.outputs = outputs;
    this.witnesses = witnesses;
    this.witnessArgs = witnessArgs;
    this.version = version;
    this.hash = hash;
  }

  static fromJson(jsonTx: ITransaction): Transaction {
    const inputs = jsonTx.inputs.map(CellInput.fromJson);
    const outputs = jsonTx.outputs.map(Cell.fromJson);

    return new Transaction(
      inputs,
      outputs,
      jsonTx.witnesses,
      jsonTx.cellDeps,
      jsonTx.headerDeps,
      jsonTx.version,
      jsonTx.hash,
      jsonTx.witnessArgs,
    );
  }

  static fromLumos(lumosTx: lumos.Transaction, inputCells: lumos.Cell): Transaction {
    const inputs = lumosTx.inputs.map((input, idx) => {
      return CellInput.fromLumos(inputCells[idx], input);
    });
    const outputs = lumosTx.outputs.map((output, idx) => {
      return Cell.fromLumos({
        ...output,
        data: lumosTx.outputs_data[idx],
      });
    });
    const cellDeps = lumosTx.cell_deps.map(FromLumos.cellDep);

    return new Transaction(
      inputs,
      outputs,
      lumosTx.witnesses,
      cellDeps,
      lumosTx.header_deps,
      lumosTx.version,
      lumosTx.hash,
    );
  }

  static fromPw(pwTx: pw.Transaction): Transaction {
    const { inputCells, cellDeps, headerDeps, version } = pwTx.raw;

    const inputs = pwTx.raw.inputs.map((input, idx) => {
      const cell = CellInput.fromPw(inputCells[idx]);
      cell.since = input.since;
      return cell;
    });
    const outputs = pwTx.raw.outputs.map(Cell.fromPw);
    const witnessArgs = pwTx.witnessArgs.map(FromPw.witnessArgs);

    return new Transaction(
      inputs,
      outputs,
      pwTx.witnesses,
      cellDeps,
      headerDeps,
      version,
      pwTx.raw.toHash(),
      witnessArgs,
    );
  }

  toJson(): ITransaction {
    return {
      ...this,
    };
  }

  toPw(): pw.Transaction {
    const inputs = this.inputs.map((input) => input.toPw());
    const outputs = this.outputs.map((output) => output.toPw());
    const cellDeps = this.cellDeps.map(ToPw.cellDep);
    const rawTx = new pw.RawTransaction(inputs, outputs, cellDeps, this.headerDeps, this.version);
    const witnessArgs = this.witnessArgs ? this.witnessArgs.map(ToPw.witnessArgs) : [];
    return new pw.Transaction(rawTx, witnessArgs);
  }
}

class ToPw {
  static outPoint(outPoint: OutPoint): pw.OutPoint {
    return new pw.OutPoint(outPoint.txHash, outPoint.index);
  }

  // TODO: depType
  static cellDep(cellDep: CellDep): pw.CellDep {
    return new pw.CellDep(
      cellDep.depType == 'code' ? pw.DepType.code : pw.DepType.depGroup,
      ToPw.outPoint(cellDep.outPoint),
    );
  }

  static witnessArgs(witnessArgs: WitnessArgs): pw.WitnessArgs {
    return {
      lock: witnessArgs.lock,
      input_type: witnessArgs.inputType,
      output_type: witnessArgs.outputType,
    };
  }
}

class FromPw {
  static OutPoint(pwOutPoint: pw.OutPoint): OutPoint {
    return {
      txHash: pwOutPoint.txHash,
      index: pwOutPoint.index,
    };
  }

  static witnessArgs(pwWitnessArgs: pw.WitnessArgs): WitnessArgs {
    return {
      inputType: pwWitnessArgs.input_type,
      lock: pwWitnessArgs.lock,
      outputType: pwWitnessArgs.output_type,
    };
  }
}

class FromLumos {
  static outPoint(lumosOutPoint: any): OutPoint {
    return {
      txHash: 'txHash' in lumosOutPoint ? lumosOutPoint.txHash : lumosOutPoint.tx_hash,
      index: lumosOutPoint.index,
    };
  }

  static cellDep(lumosCellDep: any): CellDep {
    return {
      depType: lumosCellDep.depType,
      outPoint: FromLumos.outPoint('outPoint' in lumosCellDep ? lumosCellDep.outPoint : lumosCellDep.out_point),
    };
  }
}
