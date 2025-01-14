import { Socket as SocketClient } from 'socket.io-client';
import { IBuildTxConfig, IUTXO, TxsService } from "src/app/@core/services/txs.service";
import { IMSChannelData, SwapEvent, IBuyerSellerInfo, TClient, IFuturesTradeProps, ISpotTradeProps, ETradeType } from "./common";
import { Swap } from "./swap";
import { ENCODER } from '../payloads/encoder';
import { ToastrService } from "ngx-toastr";

export class SellSwapper extends Swap {
        private tradeStartTime: number; // Add this declaration for tradeStartTime
    constructor(
        typeTrade: ETradeType,
        tradeInfo: ISpotTradeProps, // IFuturesTradeProps can be added if needed for futures
        sellerInfo: IBuyerSellerInfo,
        buyerInfo: IBuyerSellerInfo,
        client: TClient,
        socket: SocketClient,
        txsService: TxsService,
        private toastrService: ToastrService
    ) {
        super(typeTrade, tradeInfo, sellerInfo, buyerInfo, client, socket, txsService);
        this.handleOnEvents();
        this.tradeStartTime = Date.now(); // Start time of the trade
        this.onReady();
        this.initTrade();
    }

    
    private logTime(stage: string) {
        const currentTime = Date.now();
        console.log(`Time taken for ${stage}: ${currentTime - this.tradeStartTime} ms`);
    }

    private handleOnEvents() {
        this.removePreviuesListeners();
        const _eventName = `${this.cpInfo.socketId}::swap`;
        console.log(_eventName)
        this.socket.on(_eventName, (eventData: SwapEvent) => {
            this.eventSubs$.next(eventData);
            const { socketId, data } = eventData;
            console.log('event data '+JSON.stringify(eventData))
            switch (eventData.eventName){
                case 'TERMINATE_TRADE':
                    this.onTerminateTrade.bind(this)(socketId, data);
                    break;
                case 'BUYER:STEP2':
                    this.onStep2.bind(this)(socketId);
                    break;
                case 'BUYER:STEP4':
                    this.onStep4.bind(this)(socketId, data);
                    break;
                case 'BUYER:STEP6':
                    this.onStep6.bind(this)(socketId, data);
                    break;
                default:
                    break;
            }
        });
    }

    private async initTrade() {
        try {
            const pubKeys = [this.myInfo.keypair.pubkey, this.cpInfo.keypair.pubkey];
            console.log('showing pubkeys before adding multisig '+JSON.stringify(pubKeys))
            const amaRes = await this.client("addmultisigaddress", [2, pubKeys]);
            if (amaRes.error || !amaRes.data) throw new Error(`addmultisigaddress: ${amaRes.error}`);
            this.multySigChannelData = amaRes.data as IMSChannelData;

            const validateMS = await this.client("validateaddress", [this.multySigChannelData.address]);
            if (validateMS.error || !validateMS.data?.scriptPubKey) throw new Error(`Init Trade: validateaddress: ${validateMS.error}`);
            console.log('validateMS return from validateaddress in seller init '+JSON.stringify(validateMS))
            this.multySigChannelData.scriptPubKey = validateMS.data.scriptPubKey;

            const swapEvent = new SwapEvent(`SELLER:STEP1`, this.myInfo.socketId, this.multySigChannelData);
            this.socket.emit(`${this.myInfo.socketId}::swap`, swapEvent);
        } catch (error: any) {
            const errorMessage = error.message || 'Undefined Error';
            this.terminateTrade(`InitTrade: ${errorMessage}`);
        }
    }

    private async onStep2(cpId: string) {
            this.logTime('Step 2 Start');
        try {
            if (!this.multySigChannelData?.address) throw new Error(`Error with finding Multisig Address`);
            console.log('cpId '+cpId+' '+'this.cpInfo.socketId '+this.cpInfo.socketId)
            if (cpId !== this.cpInfo.socketId) throw new Error(`Error with p2p connection`);

            const fromKeyPair = { address: this.myInfo.keypair.address };
            const toKeyPair = { address: this.multySigChannelData.address };
            const commitTxConfig: IBuildTxConfig = { fromKeyPair, toKeyPair };

            let propIdDesired: number = 0;
            let amountDesired: number = 0;
            let transfer = false;

            const ctcpParams = [];
            if (this.typeTrade === ETradeType.SPOT && 'propIdDesired' in this.tradeInfo) {
                ({ propIdDesired, amountDesired, transfer = false } = this.tradeInfo as ISpotTradeProps);
                console.log('imported transfer', transfer);
                ctcpParams.push(propIdDesired, amountDesired.toString());
            }

              // Check if `propIdDesired` and `amountDesired` are assigned before usage
                if (propIdDesired === undefined || amountDesired === undefined) {
                    throw new Error('propIdDesired or amountDesired is undefined');
                }

            const column = await this.txsService.predictColumn(this.myInfo.keypair.address, this.cpInfo.keypair.address);
            const isColumnA = column === 'A';

            let payload;
            /*if (transfer) {
                console.log('Using channel balance for transfer');

                payload = ENCODER.encodeTransfer({
                    propertyId: propIdDesired,
                    amount: amountDesired,
                    isColumnA: isColumnA,
                    destinationAddr: this.multySigChannelData.address,
                });
            } else {*/
                console.log('Using available balance for trade');

                payload = ENCODER.encodeCommit({
                    amount: amountDesired,
                    propertyId: propIdDesired,
                    channelAddress: this.multySigChannelData.address,
                });
            //}

            commitTxConfig.payload = payload;

            const commitTxRes = await this.txsService.buildTx(commitTxConfig);
            if (commitTxRes.error || !commitTxRes.data) throw new Error(`Build Commit TX: ${commitTxRes.error}`);

            const { rawtx } = commitTxRes.data;
            const signCommitTxRes = await this.txsService.signRawTxWithWallet(rawtx);
            if (signCommitTxRes.error || !signCommitTxRes.data?.signedHex) throw new Error(`Sign Commit TX: ${signCommitTxRes.error}`);

            const signedHex = signCommitTxRes.data.signedHex;
            //if (signedHex) {
                const commitTxSendRes = await this.txsService.sendTx(signedHex);
                if (commitTxSendRes.error || !commitTxSendRes.data) throw new Error(`Send Commit TX: ${commitTxSendRes.error}`);
                console.log(`Commit TX sent with txid: ${commitTxSendRes.data}`);
            //} else {
            //    throw new Error('Signed Hex is undefined for Commit TX');
            //}

            const drtRes = await this.client("decoderawtransaction", [rawtx]);
            if (drtRes.error || !drtRes.data?.vout) throw new Error(`decoderawtransaction: ${drtRes.error}`);
            const vout = drtRes.data.vout.find((o: any) => o.scriptPubKey?.addresses?.[0] === this.multySigChannelData?.address);
            if (!vout) throw new Error(`decoderawtransaction (2): ${drtRes.error}`);
            const utxoData = {
                amount: vout.value,
                vout: vout.n,
                txid: commitTxSendRes.data,
                scriptPubKey: this.multySigChannelData.scriptPubKey,
                redeemScript: this.multySigChannelData.redeemScript,
            } as IUTXO;

            const swapEvent = new SwapEvent(`SELLER:STEP3`, this.myInfo.socketId, utxoData);
            this.socket.emit(`${this.myInfo.socketId}::swap`, swapEvent);
        } catch (error: any) {
            const errorMessage = error.message || 'Undefined Error';
            this.terminateTrade(`Step 2: ${errorMessage}`);
        }
    }


    private async onStep4(cpId: string, psbtHex: string) {
            this.logTime('Step 4 Start');
       try{
            //if (cpId !== this.cpInfo.socketId) return console.log(`Error with p2p connection`);
            //if (!psbtHex) throw new Error(`PsbtHex for syncing not provided`);
            console.log('params for the errs I commented '+psbtHex+' '+cpId+' '+this.cpInfo.socketId)
            const wifRes = await this.txsService.getWifByAddress(this.myInfo.keypair.address);
            if (wifRes.error || !wifRes.data) return console.log(`WIF not found: ${this.myInfo.keypair.address}`);
            console.log('inside step 4 '+JSON.stringify(wifRes))
            const signRes = await this.txsService.signPsbt({ wif: wifRes.data, psbtHex });
            if (signRes.error || !signRes.data?.psbtHex) return console.log(`Sign Tx: ${signRes.error}`);
            console.log('sign res '+JSON.stringify(signRes))
            const swapEvent = new SwapEvent(`SELLER:STEP5`, this.myInfo.socketId, signRes.data.psbtHex);
            this.socket.emit(`${this.myInfo.socketId}::swap`, swapEvent); 
        } catch (error: any) {
            const errorMessage = error.message || 'Undefined Error';
            this.terminateTrade(`Step 4: ${errorMessage}`);
        }
    }

    private async onStep6(cpId: string, finalTx: string) {
            this.logTime('Step 6 Start');
             const currentTime = Date.now();
            this.toastrService.info(`Signed! ${currentTime - this.tradeStartTime} ms`);

        //try {
            if (cpId !== this.cpInfo.socketId) /*throw new Error*/{console.log(`Error with p2p connection`)};

            const data = { txid: finalTx, seller: true, trade: this.tradeInfo };
            this.readyRes({ data });
            this.removePreviuesListeners();
        //} catch (error: any) {
        //    const errorMessage = error.message || 'Undefined Error';
        //    this.terminateTrade(`Step 6: ${errorMessage}`);
        //}
    }
}
