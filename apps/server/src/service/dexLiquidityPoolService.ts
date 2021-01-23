import { QueryOptions } from '@ckb-lumos/base';
import { Context } from 'koa';
import { txBuilder } from '.';
import { CellInfoSerializationHolderFactory, PoolInfo, Script, TokenTokenHolderFactory } from '../model';
// import { ckbRepository, DexRepository } from '../repository';
import { MockRepositoryFactory } from '../tests/mockRepositoryFactory';
import { mockCkEthPoolInfo, mockGliaPoolInfo, mockUserLiquidityCells } from '../tests/mock_data';
import { CKB_STR_TO_HASH, CKB_TOKEN_TYPE_HASH, POOL_INFO_TYPE_SCRIPT, INFO_LOCK_CODE_HASH } from '../config';

export class DexLiquidityPoolService {
  // private readonly dexRepository: DexRepository;
  private readonly txBuilderService: txBuilder.TxBuilderService;

  constructor() {
    // this.dexRepository = ckbRepository;
    this.txBuilderService = new txBuilder.TxBuilderService();
  }

  async getLiquidityPools(lock?: Script): Promise<PoolInfo[]> {
    const poolInfos = await this.getPoolInfos();
    if (lock === null || lock === undefined) {
      return poolInfos;
    }

    const userLiquiditys = await this.getUserPoolInfos(lock, poolInfos);
    return userLiquiditys;
  }

  async getLiquidityPoolByPoolId(poolId: string, lock?: Script): Promise<PoolInfo> {
    const liquidityInfo = await this.getLiquidityPools(lock);
    return liquidityInfo.find((x) => x.tokenB.typeHash === poolId);
  }

  private async getUserPoolInfos(lock: Script, poolInfos: PoolInfo[]): Promise<PoolInfo[]> {
    const userLiquiditys: PoolInfo[] = [];
    for (const poolInfo of poolInfos) {
      const script = new Script(
        INFO_LOCK_CODE_HASH,
        'type',
        CellInfoSerializationHolderFactory.getInstance()
          .getInfoCellSerialization()
          .encodeArgs(CKB_STR_TO_HASH, poolInfo.tokenB.typeHash),
      );

      const queryOptions = {
        lock: lock.toLumosScript(),
        type: new Script(poolInfo.tokenB.typeHash, 'type', script.toHash()).toLumosScript(),
      };
      // const userLiquidity = await this.dexRepository.collectCells(queryOptions);

      const mock = MockRepositoryFactory.getDexRepositoryInstance();
      mock
        .mockCollectCells()
        .resolves([])
        .withArgs({
          lock: queryOptions.lock,
          type: new Script(
            TokenTokenHolderFactory.getInstance().getTokenBySymbol('ckETH').typeHash,
            'type',
            new Script(
              INFO_LOCK_CODE_HASH,
              'type',
              CellInfoSerializationHolderFactory.getInstance()
                .getInfoCellSerialization()
                .encodeArgs(CKB_STR_TO_HASH, TokenTokenHolderFactory.getInstance().getTokenBySymbol('ckETH').typeHash),
            ).toHash(),
          ).toLumosScript(),
        })
        .resolves(mockUserLiquidityCells);

      const userLiquidityCells = await mock.collectCells(queryOptions);

      if (userLiquidityCells.length === 0) {
        continue;
      }

      poolInfo.tokenA.balance = userLiquidityCells
        .reduce((total, cell) => total + BigInt(cell.cellOutput.capacity), BigInt(0))
        .toString();

      poolInfo.tokenB.balance = userLiquidityCells
        .reduce(
          (total, cell) =>
            total + CellInfoSerializationHolderFactory.getInstance().getPoolCellSerialization().decodeData(cell.data),
          BigInt(0),
        )
        .toString();

      userLiquiditys.push(poolInfo);
    }

    return userLiquiditys;
  }

  private async getPoolInfos(): Promise<PoolInfo[]> {
    const poolInfos: PoolInfo[] = [];
    const tokens = TokenTokenHolderFactory.getInstance().getTokens();
    for (const type of POOL_INFO_TYPE_SCRIPT) {
      const queryOptions: QueryOptions = {
        lock: {
          script: {
            code_hash: INFO_LOCK_CODE_HASH,
            hash_type: 'type',
            args: '',
          },
          argsLen: 'any',
        },
        type: type.toLumosScript(),
      };

      // const poolCell = await this.dexRepository.collectCells(queryOptions);

      const mock = MockRepositoryFactory.getDexRepositoryInstance();
      mock
        .mockCollectCells()
        .withArgs({
          lock: queryOptions.lock,
          type: POOL_INFO_TYPE_SCRIPT[0].toLumosScript(),
        })
        .resolves(mockGliaPoolInfo)
        .withArgs({
          lock: queryOptions.lock,
          type: POOL_INFO_TYPE_SCRIPT[1].toLumosScript(),
        })
        .resolves(mockCkEthPoolInfo);

      const poolCell = await mock.collectCells(queryOptions);

      if (poolCell.length === 0) {
        continue;
      }

      const infoTypeHash = CellInfoSerializationHolderFactory.getInstance()
        .getInfoCellSerialization()
        .decodeArgs(poolCell[0].cellOutput.lock.args).infoTypeHash;
      const tokenB = tokens.find((x) => x.typeHash.slice(0, 42) === infoTypeHash);
      tokenB.balance = CellInfoSerializationHolderFactory.getInstance()
        .getInfoCellSerialization()
        .decodeData(poolCell[0].data)
        .sudtReserve.toString();

      // Prevent modification to the same tokenA
      const tokenA = { ...TokenTokenHolderFactory.getInstance().getTokenByTypeHash(CKB_TOKEN_TYPE_HASH) };
      tokenA.balance = CellInfoSerializationHolderFactory.getInstance()
        .getInfoCellSerialization()
        .decodeData(poolCell[0].data)
        .ckbReserve.toString();

      poolInfos.push({
        poolId: tokenB.typeScript.toHash(),
        tokenA: tokenA,
        tokenB: tokenB,
      });
    }

    return poolInfos;
  }

  public async buildCreateLiquidityPoolTx(
    ctx: Context,
    req: txBuilder.CreateLiquidityPoolRequest,
  ): Promise<txBuilder.CreateLiquidityPoolResponse> {
    return await this.txBuilderService.buildCreateLiquidityPool(ctx, req);
  }

  // FIXME: ensure req token type script exists
  public async buildGenesisLiquidityOrderTx(
    ctx: Context,
    req: txBuilder.GenesisLiquidityRequest,
  ): Promise<txBuilder.TransactionWithFee> {
    return await this.txBuilderService.buildGenesisLiquidity(ctx, req);
  }

  public async buildAddLiquidityOrderTx(
    ctx: Context,
    req: txBuilder.AddLiquidityRequest,
  ): Promise<txBuilder.TransactionWithFee> {
    return await this.txBuilderService.buildAddLiquidity(ctx, req);
  }

  public async buildRemoveLiquidityOrderTx(
    ctx: Context,
    req: txBuilder.RemoveLiquidityRequest,
  ): Promise<txBuilder.TransactionWithFee> {
    return await this.txBuilderService.buildRemoveLiquidity(ctx, req);
  }

  public async buildCancelOrderTx(
    ctx: Context,
    req: txBuilder.CancelOrderRequest,
  ): Promise<txBuilder.TransactionWithFee> {
    return await this.txBuilderService.buildCancelOrder(ctx, req);
  }
}

export const dexLiquidityPoolService = new DexLiquidityPoolService();
