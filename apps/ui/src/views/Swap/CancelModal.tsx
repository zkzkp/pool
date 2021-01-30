import { GliaswapAssetWithBalance, isShadowEthAsset, SwapOrderType } from '@gliaswap/commons';
import { Builder, Transaction } from '@lay2/pw-core';
import { Form, Modal } from 'antd';
import { AssetSymbol } from 'components/Asset';
import { ConfirmButton } from 'components/ConfirmButton';
import { ModalContainer } from 'components/ModalContainer';
import { TableRow } from 'components/TableRow';
import i18n from 'i18n';
import React from 'react';
import { useMemo } from 'react';
import styled from 'styled-components';
import { displayBalance } from 'utils';
import { useSwapContainer } from './context';
import { ReactComponent as DownArrowSvg } from 'assets/svg/down-arrow.svg';
import { MetaContainer } from 'components/MetaContainer';
import { Trans } from 'react-i18next';
import { useCallback } from 'react';
import { useState } from 'react';
import { useGliaswap } from 'contexts';
import { useQuery } from 'react-query';
import { LoadingOutlined } from '@ant-design/icons';
import { usePendingCancelOrders } from 'hooks/usePendingCancelOrders';

export const Container = styled(ModalContainer)`
  .cancel {
    color: #f35252;
  }
  .ant-form-item {
    margin-bottom: 16px;
    .ant-form-item-label {
      padding: 0;
      label {
        font-size: 14px;
        line-height: 22px;
        color: #7e7e7e;
      }
    }
    .ant-form-item-control-input {
      line-height: 22px;
      min-height: 0;
    }

    &:last-child {
      margin-top: 16px;
      margin-bottom: 0;
    }
  }
`;

export const Row = styled.div`
  display: flex;
  flex-direction: row;
  .amount {
    font-weight: bold;
    font-size: 14px;
    line-height: 22px;
    color: rgba(0, 0, 0, 0.85);
    align-items: flex-start;
    flex: 1;
  }
  .asset {
    font-weight: bold;
    font-size: 14px;
    line-height: 22px;
    color: rgba(0, 0, 0, 0.85);
    align-items: flex-end;
  }
`;

export const AssetRow = ({ asset }: { asset: GliaswapAssetWithBalance }) => {
  return (
    <Row>
      <span className="amount">{displayBalance(asset)}</span>
      <span className="asset">
        <AssetSymbol asset={asset} />
      </span>
    </Row>
  );
};

export const CancelModal = () => {
  const { cancelModalVisable, currentOrder, setCancelModalVisable } = useSwapContainer();

  const tokenA = currentOrder?.amountIn!;
  const tokenB = currentOrder?.amountOut!;

  const orderType = currentOrder?.type;

  const [isSending, setIsSending] = useState(false);
  const { api, currentUserLock, adapter } = useGliaswap();

  const isCrossChainOrder = useMemo(() => {
    return orderType === SwapOrderType.CrossChainOrder;
  }, [orderType]);

  const payAsset = useMemo(() => {
    if (isCrossChainOrder && isShadowEthAsset(tokenA!)) {
      return {
        ...tokenA.shadowFrom,
        balance: tokenA.balance,
      };
    }
    return tokenA;
  }, [isCrossChainOrder, tokenA]);

  const [cancelTx, setCancelTx] = useState<Transaction | null>(null);

  const { isFetching } = useQuery(
    ['cancel-order', cancelModalVisable, currentOrder?.transactionHash, currentUserLock],
    async () => {
      const { tx } = await api.cancelSwapOrders(currentOrder?.transactionHash!, currentUserLock!);
      return tx;
    },
    {
      enabled: cancelModalVisable && !!currentUserLock && !!currentOrder?.transactionHash,
      onSuccess(tx) {
        setCancelTx(tx);
      },
    },
  );

  const [, addPendingCancelOrder] = usePendingCancelOrders();

  const cancelOrder = useCallback(async () => {
    setIsSending(true);
    try {
      await adapter.raw.pw.sendTransaction(cancelTx!);
      addPendingCancelOrder(currentOrder?.transactionHash!);
      setCancelModalVisable(false);
    } catch (error) {
      Modal.error({
        title: 'Sign Transaction',
        content: error.message,
      });
    } finally {
      setIsSending(false);
      setCancelTx(null);
    }
  }, [adapter.raw.pw, cancelTx, addPendingCancelOrder, setCancelModalVisable, currentOrder?.transactionHash]);

  const txFee = useMemo(() => {
    if (isFetching) {
      return <LoadingOutlined />;
    }
    const fee = cancelTx ? Builder.calcFee(cancelTx).toString() : '0';
    return `${fee} CKB`;
  }, [cancelTx, isFetching]);

  return (
    <Container
      title={i18n.t('swap.cancel-modal.review')}
      footer={null}
      visible={cancelModalVisable}
      onCancel={() => setCancelModalVisable(false)}
      width="360px"
    >
      <Form layout="vertical">
        <Form.Item label={i18n.t('swap.cancel-modal.operation')}>
          <span className="cancel">{i18n.t('swap.cancel-modal.cancel-swap')}</span>
        </Form.Item>
        <Form.Item label={i18n.t('swap.cancel-modal.pay')}>
          <AssetRow asset={payAsset} />
        </Form.Item>
        <Form.Item>
          <DownArrowSvg />
        </Form.Item>
        {isCrossChainOrder ? (
          <>
            <Form.Item label={i18n.t('swap.cancel-modal.cross-chain')}>
              <AssetRow asset={tokenA} />
            </Form.Item>
            <Form.Item>
              <DownArrowSvg />
            </Form.Item>
          </>
        ) : null}
        <Form.Item label={i18n.t('swap.cancel-modal.receive')}>
          <AssetRow asset={tokenB} />
        </Form.Item>
        {isCrossChainOrder ? (
          <Form.Item>
            <MetaContainer>
              {currentOrder ? (
                <Trans
                  defaults="You will get <bold>{{amount}} {{tokenName}}</bold> back to your available balance." // optional defaultValue
                  values={{ amount: displayBalance(tokenA), tokenName: tokenA?.symbol }}
                  components={{ bold: <strong /> }}
                />
              ) : null}
            </MetaContainer>
          </Form.Item>
        ) : null}
        <TableRow
          label={i18n.t('swap.cancel-modal.tx-fee')}
          labelTooltip={i18n.t('swap.cancel-modal.tx-fee-desc')}
          value={txFee}
        />
        <Form.Item className="submit">
          <ConfirmButton
            loading={isSending || isFetching}
            onClick={cancelOrder}
            text={i18n.t('swap.cancel-modal.cancel')}
            bgColor="#F35252"
          />
        </Form.Item>
      </Form>
    </Container>
  );
};
