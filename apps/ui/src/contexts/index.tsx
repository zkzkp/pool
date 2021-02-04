import { Asset, GliaswapAPI, GliaswapAssetWithBalance, Script } from '@gliaswap/commons';
import WalletConnectProvider from '@walletconnect/web3-provider';
import { message } from 'antd';
import { useConstant } from 'commons/use-constant';
import { ConnectStatus, Provider as AdapterProvider, useWalletAdapter, Web3ModalAdapter } from 'commons/WalletAdapter';
import { AdapterContextState } from 'commons/WalletAdapter/Provider';
import { Provider as AssetProvider, RealtimeInfo, useGliaswapContext } from 'contexts/GliaswapAssetContext';
import React, { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BridgeAPI } from 'suite/api/bridgeAPI';
import { ServerGliaswapAPI } from 'suite/api/ServerGliaswapAPI';

export const GliaswapProvider: React.FC = (props) => {
  const api: GliaswapAPI = useConstant(() => ServerGliaswapAPI.getInstance());
  const bridgeAPI = useConstant(() => BridgeAPI.getInstance());

  const adapter = useConstant(() => {
    return new Web3ModalAdapter({
      ckbNodeUrl: process.env.REACT_APP_CKB_NODE_URL,
      ckbChainId: Number(process.env.REACT_APP_CKB_CHAIN_ID),
      web3ModalOptions: {
        network: process.env.REACT_APP_ETH_NETWORK,
        providerOptions: {
          walletconnect: {
            package: WalletConnectProvider,
            options: { infuraId: process.env.REACT_APP_INFURA_ID },
          },
        },
      },
    });
  });

  const [assetList, setAssetList] = useState<Asset[]>([]);
  useEffect(() => {
    (async () => {
      const hide = message.loading('launching app...', 0);
      const list = await api.getAssetList();
      hide();
      setAssetList(list);
    })();
  }, [api]);

  const queryClient = useMemo(() => {
    return new QueryClient();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        {assetList.length > 0 ? (
          <AssetProvider api={api} assetList={assetList} bridgeAPI={bridgeAPI}>
            {props.children}
          </AssetProvider>
        ) : null}
      </AdapterProvider>
    </QueryClientProvider>
  );
};

interface GliaswapState {
  /**
   * the WalletConnectAdapter
   * @see {AdapterContextState}
   */
  adapter: AdapterContextState<Web3ModalAdapter>;
  // global assets info with balance
  realtimeAssets: RealtimeInfo<GliaswapAssetWithBalance[]>;
  /**
   * an implement of GliaswapAPI
   * @see {GliaswapAPI}
   */
  api: GliaswapAPI;
  // wallet connect status
  walletConnectStatus: ConnectStatus;
  // when a wallet was connected, the user lock would be filled
  currentUserLock?: Script;

  currentCkbAddress: string;

  currentEthAddress: string;
}

export function useGliaswap(): GliaswapState {
  const adapter = useWalletAdapter<Web3ModalAdapter>();
  const { assets, api } = useGliaswapContext();

  const currentUserLock = useMemo(() => {
    if (adapter.status === 'connected') return adapter.signer.address.toLockScript();
    return undefined;
  }, [adapter.signer.address, adapter.status]);

  const currentCkbAddress = useMemo(() => {
    return currentUserLock?.toAddress().toCKBAddress() ?? '';
  }, [currentUserLock]);

  const currentEthAddress = useMemo(() => {
    if (adapter.status === 'connected') return adapter.signer.address.addressString;
    return '';
  }, [adapter.signer.address.addressString, adapter.status]);

  const walletConnectStatus = adapter.status;

  return {
    adapter,
    realtimeAssets: assets,
    walletConnectStatus,
    api,
    currentUserLock,
    currentCkbAddress,
    currentEthAddress,
  };
}
