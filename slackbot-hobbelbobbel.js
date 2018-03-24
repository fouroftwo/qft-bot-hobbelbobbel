let bot_token = process.env.SLACK_BOT_TOKEN || '';
let debugging = process.env.DEBUGGING || false;
let RtmClient = require('@slack/client').RtmClient;
let RTM_EVENTS = require('@slack/client').RTM_EVENTS;
let rtm = new RtmClient(bot_token);
let CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
let WebClient = require('@slack/client').WebClient;
let web = new WebClient(bot_token);
let fs = require('fs');

let triggerWords = JSON.parse(fs.readFileSync('./trigger-words.json', 'utf8'));
let coinsList = JSON.parse(fs.readFileSync('./coins.json', 'utf8'));
let coinsListAddendum = JSON.parse(fs.readFileSync('./coins-addendum.json', 'utf8'));
coinsList = Object.assign({}, coinsList, coinsListAddendum);
let botChannel = 'general';

let EXCHANGES = JSON.parse(JSON.stringify(triggerWords.exchanges));
let COINS = Object.keys(coinsList);
let SHENANIGANS = Object.keys(triggerWords.shenanigans);

Array.prototype.diff = function(arr2) {
    let ret = [];
    for(let i in this) {
        if(arr2.indexOf( this[i] ) > -1){
            ret.push( this[i] );
        }
    }
    return ret;
};

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  for (const c of rtmStartData.channels) {
      if (c.is_member && (c.name === 'botchat'  || c.name === 'test_lab')) {
          if(debugging) {
              console.log('Found ' +c.name);
          }
          botChannel = c.id;
      }
  }
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name} in channel ${botChannel}`);
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    rtm.sendMessage("Bot is online!", botChannel);
});

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    if ((message.subtype && message.subtype === 'bot_message') ||
        (!message.subtype && message.user === rtm.activeUserId) || message.user === undefined) {
        return;
    }
    let isShenanigans = false;
    let responseMessage = "";



    let originalMessage = message.text;
    console.log(originalMessage);

    let theMessage = message.text.toUpperCase();

    let splitMessage = [];
    let sp = theMessage.split('/');
    for (let i = 0; i < sp.length; i++) {
        let sub = sp[i].split(' ');
        for (let j = 0; j < sub.length; j++) {
            splitMessage.push(sub[j]);
        }
    }

    if(splitMessage[0]) {
        for(let i = 0; i < SHENANIGANS.length; i++) {
            if(splitMessage[0].toLowerCase().indexOf(SHENANIGANS[i]) !== -1) {
                isShenanigans = true;
                responseMessage = triggerWords.shenanigans[SHENANIGANS[i]];
            }
        }
    }

    try {
        if(!isShenanigans) {
            let foundExchange = [];
            let foundExchangeAlias = [];
            Object.keys(EXCHANGES).forEach((singleExchange) => {
                let exchange = EXCHANGES[singleExchange];
                let foundMatch = splitMessage.diff(exchange.triggers);
                if (foundMatch[0]) {
                    foundExchange.push(singleExchange);
                    foundExchangeAlias.push(foundMatch[0]);
                }
            });
            if (foundExchange.length < 1 && !foundExchange) {
                return;
            }
            let foundCoins = splitMessage.diff(COINS);
            if (foundCoins.length < 0 && !foundCoins) {
                return;
            }

            let coinWithinLimit = false;
            for (let i = 0; i < foundCoins.length; i++) {
                let coin = foundCoins[i];
                if (splitMessage[0] && splitMessage[0].indexOf(coin) !== -1) {
                    coinWithinLimit = true;
                }
                if (splitMessage[1] && splitMessage[1].indexOf(coin) !== -1) {
                    coinWithinLimit = true;
                }
                if (splitMessage[2] && splitMessage[2].indexOf(coin) !== -1) {
                    coinWithinLimit = true;
                }
            }

            let exchangeWithinLimit = false;
            for (let i = 0; i < foundExchangeAlias.length; i++) {
                let exchange = foundExchangeAlias[i];
                if (splitMessage[0] && splitMessage[0].indexOf(exchange.toUpperCase()) !== -1) {
                    exchangeWithinLimit = true;
                }
                if (splitMessage[1] && splitMessage[1].indexOf(exchange.toUpperCase()) !== -1) {
                    exchangeWithinLimit = true;
                }
                if (splitMessage[2] && splitMessage[2].indexOf(exchange.toUpperCase()) !== -1) {
                    exchangeWithinLimit = true;
                }
            }

            if (!exchangeWithinLimit || !coinWithinLimit) {
                return;
            }

            let url = EXCHANGES[foundExchange[0]].url;
            let coinigyId = EXCHANGES[foundExchange[0]].coinigy_id;
            let tradingviewId = EXCHANGES[foundExchange[0]].tradingview_id;
            let tempCoin = "";
            let coin1 = "";
            let coin2 = "";
            let coin3 = "";
            let coin4 = "";
            if (foundCoins[1] !== undefined) {
                coin1 = coin3 = foundCoins[0];
                coin2 = coin4 = foundCoins[1];
            } else {
                coin1 = coin3 = foundCoins[0];
                coin2 = coin4 = "BTC";
            }
            if (EXCHANGES[foundExchange[0]].reverse_pair === true) {
                tempCoin = coin3;
                coin3 = coin4;
                coin4 = tempCoin;
            }
            if (EXCHANGES[foundExchange[0]].caps === true) {
                coin3 = coin3.toUpperCase();
                coin4 = coin4.toUpperCase();
            }

            let exchangeLink = url + coin3 + EXCHANGES[foundExchange[0]].divider + coin4;
            let coinigyLink = "https://www.coinigy.com/main/markets/" + coinigyId + "/" + coin1 + "/" + coin2;
            let tradingviewLink = "";
            if (tradingviewId) {
                tradingviewLink = "https://www.tradingview.com/chart/?symbol=" + tradingviewId + ":" + coin1 + coin2;
            }

            if (debugging) {
                console.log(exchangeLink);
                console.log(coinigyLink);
                console.log(tradingviewLink);
                console.log("message channel", message.channel, "message ts", message.ts);
            }

            responseMessage = exchangeLink + "\n" + coinigyLink + "\n" + tradingviewLink;
            console.log(responseMessage);
        }




        let messageObject = {
            channel:   message.channel,
            type:      RTM_EVENTS.MESSAGE,
        };
        if(isShenanigans) {
            console.log("isShenanigans");
            if(message.thread_ts) {
                messageObject = Object.assign({}, messageObject, {
                    thread_ts: message.thread_ts,
                });
            }
        } else {
            console.log("is not Shenanigans");
            let thread = message.ts;
            if (message.thread_ts) {
                thread = message.thread_ts;
            }
            messageObject = Object.assign({}, messageObject, {
                thread_ts: thread,
            });
        }

        messageObject = Object.assign({}, messageObject, {
            text:      responseMessage,
        });
        console.log(messageObject);

        rtm.send(messageObject);
    } catch(e) {
        console.log('wtf is this shit?');
        console.log(e);
    }

});

rtm.start();