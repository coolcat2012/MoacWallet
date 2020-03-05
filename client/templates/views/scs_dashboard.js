import {Template} from 'meteor/templating';
import '../../lib/collections.js';
import '../elements/account.js';
import '../elements/mistAlert.js';
import '../elements/transactionTable.js';
import './scs_dashboard.html';

/**
Template Controllers

@module Templates
*/

/**
The dashboard template

@class [template] views_scs_dashboard
@constructor
*/

/**
The default gas to provide for estimates. This is set manually,
so that invalid data etsimates this value and we can later set it down and show a warning,
when the user actually wants to send the dummy data.

@property defaultEstimateGas
*/
var defaultEstimateGas = 50000000;

Template['views_scs_dashboard'].helpers({
    /**
    Are there any scs_node?

    @method (hasScsNode)
    */
    'hasAccounts' : function() {
        // return (McAccounts.find().count() > 0);
        return false;
    }
});


/**
Check if the amount accounts daily limit  and sets the correct text.

@method checkOverDailyLimit
*/
var checkOverDailyLimit = function (address, sha, template) {
    // check if under or over dailyLimit
    account = Helpers.getAccountByAddress(address);

    if (account && account.requiredSignatures > 1 && !_.isUndefined(account.dailyLimit) && account.dailyLimit !== moacConfig.dailyLimitDefault && Number(sha) !== 0) {
        // check whats left
        var restDailyLimit = new BigNumber(account.dailyLimit || '0', 10).minus(new BigNumber(account.dailyLimitSpent || '0', 10));

        if (restDailyLimit.lt(new BigNumber(sha, 10)))
            TemplateVar.set('dailyLimitText', new Spacebars.SafeString(TAPi18n.__('wallet.send.texts.overDailyLimit', { limit: McTools.formatBalance(restDailyLimit.toString(10)), total: McTools.formatBalance(account.dailyLimit), count: account.requiredSignatures - 1 })));
        else
            TemplateVar.set('dailyLimitText', new Spacebars.SafeString(TAPi18n.__('wallet.send.texts.underDailyLimit', { limit: McTools.formatBalance(restDailyLimit.toString(10)), total: McTools.formatBalance(account.dailyLimit) })));
    } else
        TemplateVar.set('dailyLimitText', false);
};

/**
Get the data field of either the byte or source code textarea, depending on the selectedType

@method getDataField
*/
var getDataField = function () {
    // make reactive to the show/hide of the textarea
    TemplateVar.getFrom('.compile-contract', 'byteTextareaShown');

    // send tokens
    var selectedToken = TemplateVar.get('selectedToken');

    if (selectedToken && selectedToken !== 'mc') {
        var mainRecipient = TemplateVar.getFrom('div.dapp-address-input input.to', 'value');
        var amount = TemplateVar.get('amount') || '0';
        var token = Tokens.findOne({ address: selectedToken });
        var tokenInstance = TokenContract.at(selectedToken);
        var txData = tokenInstance.transfer.getData(mainRecipient, amount, {});

        return txData;
    }

    return TemplateVar.getFrom('.compile-contract', 'txData');
};


/**
Gas estimation callback

@method estimationCallback
*/
var estimationCallback = function (e, res) {
    var template = this;

    console.log('Estimated gas: ', res, e);

    if (!e && res) {
        TemplateVar.set(template, 'estimatedGas', res);

        // show note if its defaultEstimateGas, as the data is not executeable
        if (res === defaultEstimateGas)
            TemplateVar.set(template, 'codeNotExecutable', true);
        else
            TemplateVar.set(template, 'codeNotExecutable', false);
    }
};

/**
Translate an external error message into the user's language if possible. Otherwise return
the old error message.

@method translateExternalErrorMessage
*/
var translateExternalErrorMessage = function (message) {
    // 'setTxStatusRejected' occurs in the stack trace of the error message triggered when
    // the user has rejects a transaction in MetaMask. Show a localised error message
    // instead of the stack trace.
    if (message.indexOf('setTxStatusRejected') !== -1) {
        return TAPi18n.__('wallet.send.error.rejectedInMetamask');
    } else {
        return message;
    }
};



// Set basic variables
Template['views_scs_dashboard'].onCreated(function () {
    var template = this;
    Tracker.autorun(function () {
        FlowRouter.watchPathChange();
        TemplateVar.set(template, 'subChainDapp', false);
    });

	TemplateVar.set('selectedTransType','isDepositting');	
	TemplateVar.set('isIntra',false);
	
    TemplateVar.set('monitorAddr','localhost');
    TemplateVar.set('monitorPort',8548);
    Tracker.autorun(function () {
        scsApi2.init(TemplateVar.get(template, 'monitorAddr'), TemplateVar.get(template, 'monitorPort'));
    })
    // SET THE DEFAULT VARIABLES
    TemplateVar.set('amount', '0');
    TemplateVar.set('estimatedGas', 300000);
    TemplateVar.set('sendAll', false);
	//TemplateVar.set('fromSubChain', false);
	//TemplateVar.set('toSubChain', false);
	TemplateVar.set('isIntra', false);
	TemplateVar.set('isWithdrawing', false);

    // Deploy contract
    //if (FlowRouter.getRouteName() === 'deployContract') {
    //    TemplateVar.set('selectedAction', 'deploy-contract');
    //    TemplateVar.set('selectedToken', 'mc');

        // Send funds
    //} else {
        TemplateVar.set('selectedAction', 'send-funds');
        TemplateVar.set('selectedToken', FlowRouter.getParam('token') || 'mc');
    //}

    // check if we are still on the correct chain
    Helpers.checkChain(function (error) {
        if (error && (McAccounts.find().count() > 0)) {
            checkForOriginalWallet();
        }
    });


    // check daily limit again, when the account was switched
    template.autorun(function (c) {
        var address = TemplateVar.getFrom('.dapp-select-account.send-from', 'value'),
		//var address = TemplateVar.getFrom('.dapp-address-input .from', 'value'),
			//fromSubChain=TemplateVar.get('fromSubChain'),
            amount = TemplateVar.get('amount') || '0';

        if (!c.firstRun) {
            checkOverDailyLimit(address, amount, template);
        }
    });

    // change the amount when the currency unit is changed
    template.autorun(function (c) {
        var unit = McTools.getUnit();

        if (!c.firstRun && TemplateVar.get('selectedToken') === 'mc') {
            TemplateVar.set('amount', McTools.toSha(template.find('input[name="amount"]').value.replace(',', '.'), unit));
        }
    });

});



Template['views_scs_dashboard'].onRendered(function () {
    var template = this;

    // focus address input field
    if (FlowRouter.getParam('address')) {
        this.find('input[name="to"]').value = FlowRouter.getParam('address');
        this.$('input[name="to"]').trigger('input');
    } else if (!this.data) {
        this.$('input[name="to"]').focus();
    }

    // set the from
    var from = FlowRouter.getParam('from');
    if (from)
        TemplateVar.setTo('select[name="dapp-select-account"].send-from', 'value', FlowRouter.getParam('from').toLowerCase());


    // initialize send view correctly when directly switching from deploy view
    template.autorun(function (c) {
        if (FlowRouter.getRouteName() === 'send') {
            TemplateVar.set('selectedAction', 'send');
            TemplateVar.setTo('.dapp-data-textarea', 'value', '');
        }
    });


    // change the token type when the account is changed
    var selectedAddress;
	//var from;
    template.autorun(function (c) {

        address = TemplateVar.getFrom('.dapp-select-account.send-from', 'value');
		//address = TemplateVar.getFrom('.dapp-address-input .from', 'value'),
			//fromSubChain=TemplateVar.get('fromSubChain');

        if (c.firstRun) {
            selectedAddress = address;
            return;
        };


        if (selectedAddress !== address) {
            TemplateVar.set('selectedToken', 'mc');
        }

        selectedAddress = address;
    });

    // ->> GAS PRICE ESTIMATION
    template.autorun(function (c) {
        var address = TemplateVar.getFrom('.dapp-select-account.send-from', 'value'),
            //from = TemplateVar.getFrom('.dapp-address-input .from', 'value'),
			//to = TemplateVar.getFrom('.dapp-address-input .to', 'value'),
            amount = TemplateVar.get('amount') || '0',
            data = getDataField(),
            tokenAddress = TemplateVar.get('selectedToken');
		if( isSending ){
			to = TemplateVar.getFrom('.dapp-address-input .peer', 'value');
		}else{
			to = address;
		}

        var microChainDapp = TemplateVar.get('subChainDapp') || false;

        if (_.isString(address))
            address = address.toLowerCase();

		
//need to change: no gas when intra;
        if (!microChainDapp) {
            // Mc tx estimation
            if (tokenAddress === 'mc') {

                if (McAccounts.findOne({ address: address }, { reactive: false })) {
                    chain3.mc.estimateGas({
                        from: address,
                        to: to,
                        value: amount,
                        data: data,
                        gas: defaultEstimateGas
                    }, estimationCallback.bind(template));

                    // Wallet tx estimation
                } else if (wallet = Wallets.findOne({ address: address }, { reactive: false })) {

                    if (contracts['ct_' + wallet._id])
                        contracts['ct_' + wallet._id].execute.estimateGas(to || '', amount || '', data || '', {
                            from: wallet.owners[0],
                            gas: defaultEstimateGas
                        }, estimationCallback.bind(template));
                }

                // Custom coin estimation
            } else {

                TokenContract.at(tokenAddress).transfer.estimateGas(to, amount, {
                    from: address,
                    gas: defaultEstimateGas
                }, estimationCallback.bind(template));
            }
        }
    });
});


Template['views_scs_dashboard'].helpers({
	

    /**
    Get the current selected account

    @method (selectedAccount)
    */
    'selectedAccount': function () {
        return Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
    },
    /**
    Get the current selected token document

    @method (selectedToken)
    */
    'selectedToken': function () {
        return Tokens.findOne({ address: TemplateVar.get('selectedToken') });
    },
    /**
    Retrun checked, if the current token is selected

    @method (tokenSelectedAttr)
    */
    'tokenSelectedAttr': function (token) {
        return (TemplateVar.get('selectedToken') === token)
            ? { checked: true }
            : {};
    },
    /**
    Get all tokens

    @method (tokens)
    */
    'tokens': function () {
        if (TemplateVar.get('selectedAction') === 'send-funds')
            return Tokens.find({}, { sort: { name: 1 } });
    },
    /**
    Checks if the current selected account has tokens

    @method (hasTokens)
    */
    'hasTokens': function () {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value')),
            query = {};
        console.log("selectedAccount", selectedAccount);
        // chain3.scs.getNonce("0xa1eefaaa40ddbe1317cea35a8be58ac488de3a12",selectedAccount.address,function(e,r){console.log(e,r)})


        if (!selectedAccount)
            return;
//need to check subchain?
        query['balances.' + selectedAccount._id] = { $exists: true, $ne: '0' };

        return (TemplateVar.get('selectedAction') === 'send-funds' && !!Tokens.findOne(query, { field: { _id: 1 } }));
    },
    /**
    Show the byte code only for the data field

    @method (showOnlyByteTextarea)
    */
    'showOnlyByteTextarea': function () {
        return (TemplateVar.get("selectedAction") !== "deploy-contract");
    },
    /**
    Return the currently selected fee + amount

    @method (total)
    */
    'total': function (mc) {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
        var amount = TemplateVar.get('amount');
        if (!_.isFinite(amount))
            return '0';

        // mc
        var gasInSha = TemplateVar.getFrom('.dapp-select-gas-price', 'gasInSha') || '0';

        if (TemplateVar.get('selectedToken') === 'mc') {
            amount = (selectedAccount && selectedAccount.owners)
                ? amount
                : new BigNumber(amount, 10).plus(new BigNumber(gasInSha, 10));
        } else {
            amount = new BigNumber(gasInSha, 10);
        }
        return amount;
    },
    /**
    Return the currently selected token amount

    @method (tokenTotal)
    */
    'tokenTotal': function () {
        var amount = TemplateVar.get('amount'),
            token = Tokens.findOne({ address: TemplateVar.get('selectedToken') });

        if (!_.isFinite(amount) || !token)
            return '0';

        return Helpers.formatNumberByDecimals(amount, token.decimals);
    },
    /**
    Returns the total amount - the fee paid to send all mc/coins out of the account

    @method (sendAllAmount)
    */
    'sendAllAmount': function () {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
        var amount = 0;

        if (TemplateVar.get('selectedToken') === 'mc') {
            var gasInSha = TemplateVar.getFrom('.dapp-select-gas-price', 'gasInSha') || '0';

            // deduct fee if account, for contracts use full amount
            amount = (selectedAccount.owners)
                ? selectedAccount.balance
                : BigNumber.max(0, new BigNumber(selectedAccount.balance, 10).minus(new BigNumber(gasInSha, 10))).toString(10);
        } else {
            var token = Tokens.findOne({ address: TemplateVar.get('selectedToken') });

            if (!token || !token.balances || !token.balances[selectedAccount._id])
                amount = '0';
            else
                amount = token.balances[selectedAccount._id];
        }

        TemplateVar.set('amount', amount);
        return amount;
    },
    /**
    Returns the decimals of the current token

    @method (tokenDecimals)
    */
    'tokenDecimals': function () {
        var token = Tokens.findOne({ address: TemplateVar.get('selectedToken') });
        return token ? token.decimals : 0;
    },
    /**
    Returns the right time text for the "sendText".

    @method (timeText)
    */
    'timeText': function () {
        return TAPi18n.__('wallet.send.texts.timeTexts.' + ((Number(TemplateVar.getFrom('.dapp-select-gas-price', 'feeMultiplicator')) + 5) / 2).toFixed(0));
    },
    /**

    Shows correct explanation for token type

    @method (sendExplanation)
    */
    'sendExplanation': function () {

        var amount = TemplateVar.get('amount') || '0',
            selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value')),
            token = Tokens.findOne({ address: TemplateVar.get('selectedToken') });

        if (!token || !selectedAccount)
            return;

        return Spacebars.SafeString(TAPi18n.__('wallet.send.texts.sendToken', {
            amount: Helpers.formatNumberByDecimals(amount, token.decimals),
            name: token.name,
            symbol: token.symbol
        }));

    },
    /**
    Get Balance of a token

    @method (formattedCoinBalance)
    */
    'formattedCoinBalance': function (e) {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));

        return (this.balances && Number(this.balances[selectedAccount._id]) > 0)
            ? Helpers.formatNumberByDecimals(this.balances[selectedAccount._id], this.decimals) + ' ' + this.symbol
            : false;
    },
    /**
    Checks if the current selected account is a wallet contract

    @method (selectedAccountIsWalletContract)
    */
    'selectedAccountIsWalletContract': function () {
        var selectedAccount = Helpers.getAccountByAddress(TemplateVar.getFrom('.dapp-select-account.send-from', 'value'));
        return selectedAccount ? !!selectedAccount.owners : false;
    },
    /**
    Clear amount from characters

    @method (clearAmountFromChars)
    */
    'clearAmountFromChars': function (amount) {
        amount = (~amount.indexOf('.'))
            ? amount.replace(/\,/g, '')
            : amount;

        return amount.replace(/ /g, '');
    }
});


Template['views_scs_dashboard'].events({
    /**
     Send subChainDapp
 
     @event change input.subChainDapp
     */
    //'change input.subChainDapp': function (e) {
    //    TemplateVar.set('subChainDapp', $(e.currentTarget)[0].checked);
    //    TemplateVar.set('subChainBaseAddress', '');
    //},
    /**
    Send all funds

    @event change input.send-all
    */
    'change input.send-all': function (e) {
        TemplateVar.set('sendAll', $(e.currentTarget)[0].checked);
        TemplateVar.set('amount', 0);
    },
    /**
    Select a token

    @event click .token-mc
    */
    'click .token-mc': function (e, template) {
        TemplateVar.set('selectedToken', 'mc');

        // trigger amount box change
        template.$('input[name="amount"]').trigger('change');
    },
    /**
    Select a token

    @event click .select-token
    */
    'click .select-token input': function (e, template) {
        var value = e.currentTarget.value;
        TemplateVar.set('selectedToken', value);

        if (value === 'mc')
            TemplateVar.setTo('.dapp-data-textarea', 'value', '');

        // trigger amount box change
        template.$('input[name="amount"]').trigger('change');
    },
	
	'change select.select-trans-type': function (e, template) {

        var value = e.currentTarget.value;

        TemplateVar.set('selectedTransType', value);

        if (value === 'isSending' ){
            TemplateVar.set('isIntra', true);

		}
		else{
			TemplateVar.set('isIntra', false);
			if( value === 'isWithdrawing' )
				TemplateVar.set('isWithdrawing', true);
		
		}

        //trigger amount box change
        //template.$('input[name="amount"]').trigger('change');
    },
	
    /**
    Set the amount while typing

    @event keyup input[name="amount"], change input[name="amount"], input input[name="amount"]
    */
    'keyup input[name="amount"], change input[name="amount"], input input[name="amount"]': function (e, template) {
        // mc
        if (TemplateVar.get('selectedToken') === 'mc') {
            var sha = McTools.toSha(e.currentTarget.value.replace(',', '.'));

            TemplateVar.set('amount', sha || '0');

            checkOverDailyLimit(template.find('select[name="dapp-select-account"].send-from').value, sha, template);

            // token
        } else {

            var token = Tokens.findOne({ address: TemplateVar.get('selectedToken') }),
                amount = e.currentTarget.value || '0';

            amount = new BigNumber(amount, 10).times(Math.pow(10, token.decimals || 0)).floor().toString(10);

            TemplateVar.set('amount', amount);
        }
    },
    /**
    React on user input on Monitor RPC Address

    @event change .monitorAddrInput
    */
    'keyup .monitorAddrInput, change .monitorAddrInput, input .monitorAddrInput': function (e, template) {
        TemplateVar.set('monitorAddr', e.currentTarget.value);
    },
    /**
    React on user input on Monitor RPC Port

    @event change .monitorAddrInput
    */
    'keyup .monitorPortInput, change .monitorPortInput, input .monitorPortInput': function (e, template) {
        TemplateVar.set('monitorPort', e.currentTarget.value);
    },
    /**
    Submit the form and send the transaction!

    @event submit form
    */
    'submit form': function (e, template) {

        var microChainDapp = TemplateVar.get('subChainDapp') || false;

        var amount = TemplateVar.get('amount') || '0',
			tokenAddress = TemplateVar.get('selectedToken'),
			subChainAddr = TemplateVar.getFrom('.dapp-address-input .subChain-addr', 'value'),
			subChainVia = TemplateVar.getFrom('.dapp-address-input .subChain-via', 'value'),
			//from = TemplateVar.getFrom('.dapp-address-input .from', 'value'),
            gasPrice = TemplateVar.getFrom('.dapp-select-gas-price', 'gasPrice'),
            estimatedGas = TemplateVar.get('estimatedGas'),
            selectedAccount = Helpers.getAccountByAddress(template.find('select[name="dapp-select-account"].send-from').value),
            selectedAction = TemplateVar.get("selectedAction"),
            data = getDataField(),
            contract = TemplateVar.getFrom('.compile-contract', 'contract'),
            sendAll = TemplateVar.get('sendAll'),
            monitorAddr = TemplateVar.get('monitorAddr'),
            monitorPort = TemplateVar.get('monitorPort');
		var to = null;
		if( TemplateVar.get("selectedTransType") === 'isSending' ){

			to = TemplateVar.getFrom('.dapp-address-input .peer', 'value');
		}else if( TemplateVar.get("selectedTransType") === 'isWithdrawing' ){
		
			//var dapplist = chain3.scs.getDappAddrList(subChainAddr);
			dappAddr = TemplateVar.getFrom('.dapp-address-input .dapp', 'value')
			//dapplist[0];


		}

        if (selectedAccount && !TemplateVar.get('sending')) {

            // set gas down to 21 000, if its invalid data, to prevent high gas usage.
            if (estimatedGas === defaultEstimateGas || estimatedGas === 0)
                estimatedGas = 22000;

            // if its a wallet contract and tokens, don't need to remove the gas addition on send-all, as the owner pays
            if (sendAll && (selectedAccount.owners || tokenAddress !== 'mc'))
                sendAll = false;


            console.log('Providing gas: ', estimatedGas, sendAll ? '' : ' + 50000');

            //if (TemplateVar.get('selectedAction') === 'deploy-contract' && !data)
            //    return GlobalNotification.warning({
            //        content: 'i18n:wallet.contracts.error.noDataProvided',
            //        duration: 2
            //    });

            if (selectedAccount.balance === '0' && (!selectedAccount.owners || tokenAddress === 'mc'))
                return GlobalNotification.warning({
                    content: 'i18n:wallet.send.error.emptyWallet',
                    duration: 2
                });

            if (!chain3.isAddress(to) && TemplateVar.get("selectedTransType") === 'isSending') //!data)
                return GlobalNotification.warning({
                    content: 'i18n:wallet.send.error.noReceiver',
                    duration: 2
                });

            if (tokenAddress === 'mc') {

                if ((_.isEmpty(amount) || amount === '0' || !_.isFinite(amount)) && !data)
                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.noAmount',
                        duration: 2
                    });

                if (!microChainDapp) {
                    if (new BigNumber(amount, 10).gt(new BigNumber(selectedAccount.balance, 10)))
                        return GlobalNotification.warning({
                            content: 'i18n:wallet.send.error.notEnoughFunds',
                            duration: 2
                        });
                }

            } else { // Token transfer

                if( TemplateVar.get("selectedTransType") === 'isSending' && !to) {

                    return GlobalNotification.warning({
                        content: 'i18n:wallet.send.error.noReceiver',
                        duration: 2
                    });
                }

                // Change recipient and amount
                to = tokenAddress;
                amount = 0;

                var token = Tokens.findOne({ address: tokenAddress }),
                    tokenBalance = token.balances[selectedAccount._id] || '0';

                if (!microChainDapp) {
                    if (new BigNumber(amount, 10).gt(new BigNumber(tokenBalance, 10)))
                        return GlobalNotification.warning({
                            content: 'i18n:wallet.send.error.notEnoughFunds',
                            duration: 2
                        });
                }
            }

             var sendTransaction = function (estimatedGas) {
                // show loading
                TemplateVar.set(template, 'sending', true);

                // use gas set in the input field
                estimatedGas = estimatedGas || Number($('.send-transaction-info input.gas').val());
                console.log('Finally choosen gas', estimatedGas);

                // CONTRACT TX
                if (contracts['ct_' + selectedAccount._id]) {

                    contracts['ct_' + selectedAccount._id].execute.sendTransaction(to || '', amount || '', data || '', {
                        from: Helpers.getOwnedAccountFrom(selectedAccount.owners),
                        gasPrice: gasPrice,
                        gas: estimatedGas
                    }, function (error, txHash) {

                        TemplateVar.set(template, 'sending', false);

                        console.log(error, txHash);
                        if (!error) {
                            console.log('SEND from contract', amount);

                            data = (!to && contract)
                                ? { contract: contract, data: data }
                                : data;

                            addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, data);

                            localStorage.setItem('contractSource', Helpers.getDefaultContractExample());
                            localStorage.setItem('compiledContracts', null);
                            localStorage.setItem('selectedContract', null);

                            FlowRouter.go('dashboard');

                        } else {
                            // McElements.Modal.hide();

                            GlobalNotification.error({
                                content: translateExternalErrorMessage(error.message),
                                duration: 8
                            });
                        }
                    });

                    // SIMPLE TX
                } else {
                    var tranData;
                    var isMicroChain = false;

                    if(microChainDapp){
                        var viaAddr = chain3.vnode.address;
                        tranData={
                            from: fromAccount.selectedAccount,
                            to: to,
                            data: data,
                            value: amount,
                            gas: 0,
                            shardingFlag: 1,
                            nonce: 0,
                            via: viaAddr
                        };

                        isMicroChain = true;
                    }
                    else{
                        tranData={
                            from: fromAccount.selectedAccount,
                            to: to,
                            data: data,
                            value: amount,
                            gas: estimatedGas
                        };
                    }

                    chain3.mc.sendTransaction(tranData, function(error, txHash){

                    TemplateVar.set(template, 'sending', false);

                    if (!error) {
                        data = (!to && contract)
                            ? { contract: contract, data: data }
                            : data;
                        if (isMicroChain === false) {
                            addTransactionAfterSend(txHash, amount, selectedAccount.address, to, gasPrice, estimatedGas, data, isMicroChain);
                        }
                        else {
                            var contractName = contract.name.replace(/([A-Z])/g, ' $1');
                            var jsonInterface = contract.jsonInterface

                                MicroChainContracts.upsert({address: to}, {$set: {
                                    address: to,
                                    name: ( contractName || 'New Contract') + ' ' + to.substr(2, 4),
                                    jsonInterface: jsonInterface,
                                    monitorAddr: monitorAddr,
                                    monitorPort: monitorPort
                                }}, {upsert: true});
                            }

                        localStorage.setItem('contractSource', Helpers.getDefaultContractExample());
                        localStorage.setItem('compiledContracts', null);
                        localStorage.setItem('selectedContract', null);

                        FlowRouter.go('dashboard');
                    } else {

                        // McElements.Modal.hide();

                            GlobalNotification.error({
                                content: translateExternalErrorMessage(error.message),
                                duration: 8
                            });
                        }
                    });
                }
            };
			
			
		
			

			var sendBaseChainTransaction = function(){
				// SHOW CONFIRMATION WINDOW when NOT MIST
				if (typeof mist === 'undefined') {

					console.log('estimatedGas: ' + estimatedGas);

                McElements.Modal.question({
                    template: 'views_modals_sendTransactionInfo',
                    data: {
                        from: selectedAccount.address,
                        to: to,
                        amount: amount,
                        gasPrice: gasPrice,
                        estimatedGas: estimatedGas,
                        estimatedGasPlusAddition: sendAll ? estimatedGas : estimatedGas + 50000, // increase the provided gas by 50k
                        data: data
                    },
                    ok: sendTransaction,
                    cancel: true
                }, {
                        class: 'send-transaction-info'
                    });

					// LET MIST HANDLE the CONFIRMATION
				} else {
						sendTransaction(sendAll ? estimatedGas : estimatedGas + 50000);
				}
			}

			var sendshardingflagtx = function(baseaddr, basepsd, appchainaddr, amount, receive, nonce, vnodevia)
			{       
			  //console.log("Appchain ", appchainaddr, " Account:", baseaddr, " Transfer ", amount, " to ", receive)

			  //chain3.personal.unlockAccount(baseaddr,basepsd);
			  chain3.mc.sendTransaction(
					{       
							from: baseaddr,
							nonce: nonce, 
							value: amount, //chain3.toSha(amount,'mc'),
							to: appchainaddr,
							gas: '0',//'200000',
							gasPrice: '0',//chain3.mc.gasPrice,
							ShardingFlag: '0x2',
							data: receive,
							via:vnodevia,
					},function(err,txHash){
					 //TemplateVar.set(template, 'sending', false); //??? 
				
					if(!err){
					
						//addTransactionAfterSend(txHash,amount,baseaddr,receive,0,0,receive,null);
						//FlowRouter.go('dashboard');
						McElements.Modal.question({
							template: 'views_modals_scsEndTransactionInfo',
							data: {
								//subChainAddr: subChainAddr,
								//from: selectedAccount.address,
								//amount: amount,
								type: 'isSending',
								hash: txHash
							},
							ok: true,
							cancel: false
						});
					}else{
					
						GlobalNotification.error({
							content:translateExternalErrorMessage.message(err.message),
							duration:8
						});
					}
				});
				//chain3.personal.lockAccount(baseaddr);     
				//console.log('sending from:' + baseaddr + ' to:' + receive  + ' with nonce:' + n);
				//console.log('sending from:' + baseaddr + ' to:' + receive);
			}			


			var depositToAppChain = function(baseaddr,basepsd, appchainaddr, amount)
			{
				console.log("Account:", baseaddr, "\nDepositing ", amount, " to ", appchainaddr)
				console.log("it has :"+chain3.mc.getBalance(baseaddr).toString());

				//chain3.personal.unlockAccount(baseaddr,basepsd);
				//txhash = 
				chain3.mc.sendTransaction( { from: baseaddr, 
				  value: amount,  //chain3.toSha(amount,'mc'), 
				  to: appchainaddr, 
				  gas:"2000000", 
				  gasPrice: chain3.mc.gasPrice, 
				  data: '0x6bbded70'},function(err,txHash){
					 //TemplateVar.set(template, 'sending', false); //??? 
				
					if(!err){
						//alert('deposit 3');
						//addTransactionAfterSend(txHash,amount,baseaddr,null,200000,chain3.mc.gasPrice,'0x6dded70',null);
						//FlowRouter.go('dashboard');
						McElements.Modal.question({
							template: 'views_modals_scsEndTransactionInfo',
							data: {
								//subChainAddr: subChainAddr,
								//from: selectedAccount.address,
								//amount: amount,
								type: 'isDepositting',
								hash: txHash
							},
							ok: true,
							cancel: false
						});
					}else{
					
						GlobalNotification.error({
							content:translateExternalErrorMessage.message(err.message),
							duration:8
						});
					}
				  });
				//chain3.personal.lockAccount(baseaddr);

				//return txhash;
			}							

			var withdrawFromAppChain =  function(baseaddr,basepsd, appchainaddr, dappbaseaddr, innonce, amount, vnodevia)
				{
					console.log("Account:", baseaddr, "\nWithdrawing ", amount, " from ", appchainaddr," by ",dappbaseaddr)
					//chain3.personal.unlockAccount(baseaddr,basepsd);

					//txhash = 
					chain3.mc.sendTransaction( 
					  { 
						nonce: innonce, 
						from: baseaddr, 
						value: amount, //chain3.toSha(amount,'mc'), 
						to: appchainaddr, 
						gas:0, 
						shardingFlag:'0x1', 
						data: dappbaseaddr + '89739c5b', 
						via: vnodevia
					  },function(err,txHash){
						  //TemplateVar.set(template, 'sending', false); //???
						  if(!err){
								
								//addTransactionAfterSend(txHash,amount,null,baseaddr,0,0,dappbaseaddr + '89739c5b',null);
								//FlowRouter.go('dashboard');
								McElements.Modal.question({
									template: 'views_modals_scsEndTransactionInfo',
									data: {
										//subChainAddr: subChainAddr,
										//from: selectedAccount.address,
										//amount: amount,
										type: 'isWithdrawing',
										hash: txHash
									},
									ok: true,
									cancel: false
								});
							}else{
							
								GlobalNotification.error({
									content:translateExternalErrorMessage.message(err.message),
									duration:8
								});
							}
					  });

					//chain3.personal.lockAccount(baseaddr);
					//return txhash;
				}
				
            // The function to send the transaction

			if( TemplateVar.get("selectedTransType") === 'isDepositting' ){
		
				var depositCall = function(){
					depositToAppChain(selectedAccount.address,'',subChainAddr,amount);
				}
				McElements.Modal.question({
                    template: 'views_modals_scsTransactionInfo',
                    data: {
						subChainAddr: subChainAddr,
                        from: selectedAccount.address,
                        amount: amount,
						type: 'isDepositting'
                    },
                    ok: depositCall,
                    cancel: true
				});
			}else if( TemplateVar.get("selectedTransType") === 'isWithdrawing' ){
			
				var nonce = chain3.scs.getNonce(subChainAddr,selectedAccount.address);
				//withdrawFromAppChain(selectedAccount.address,"", subChainAddr, testto, nonce, amount, subChainVia);			
				var withdrawCall = function(){
					withdrawFromAppChain(selectedAccount.address,"", subChainAddr, dappAddr, nonce, amount, subChainVia);			
				}
				McElements.Modal.question({
                    template: 'views_modals_scsTransactionInfo',
                    data: {
						subChainAddr: subChainAddr,
                        from: selectedAccount.address,
                        amount: amount,
						type: 'isWithdrawing'
                    },
                    ok: withdrawCall,
                    cancel: true
				});
			}else {

				var nonce = chain3.scs.getNonce(subChainAddr,selectedAccount.address);
				//to = "0xD814F2ac2c4cA49b33066582E4e97EBae02F2111";
				//var nonce = 100;
				var sendCall = function(){
					sendshardingflagtx(selectedAccount.address, "", subChainAddr, amount, to, nonce, subChainVia);	                   
				}
				McElements.Modal.question({
                    template: 'views_modals_scsTransactionInfo',
                    data: {
						subChainAddr: subChainAddr,
                        from: selectedAccount.address,
                        amount: amount,
						to: to,
						type: 'isSending'
                    },
                    ok: sendCall,
                    cancel: true
				});
			}

	
        }
    }
});