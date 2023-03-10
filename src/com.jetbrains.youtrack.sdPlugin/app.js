/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/stream-deck.js" />

const myAction = new Action('com.jetbrains.youtrack.get-ticket-count');
myAction.cache = {}

function APIRequest(context, settings) {
    const youTrack = {
        Ready: false,
        token: "",
        url: "",
        searchQuery: "",
        GetTicketsCount: async function () {
            if (youTrack.ready) {
                return await youTrack.RunQuery(youTrack.url, youTrack.token, youTrack.searchQuery);
            } else {
                return "Error";
            }
        },
        RunQuery: async function (url, token, query) {
            url = url + '/api/issues?fields=idReadable,summary,votes,customFields(projectCustomField(field(name)),value(name))&$top=500&query=' + youTrack.EscapeQuery(query)
            console.log("executing: " + query);
            let response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                }
            });
            const data = await response.json();
            return data.length;
        },
        EscapeQuery: function (query) {
            return query.replace(/ /g, '+').replace(/#/g, '%23');
        },
        OpenPage: function () {
            let url = youTrack.url + '/issues?q=' + youTrack.EscapeQuery(youTrack.searchQuery)
            $SD.openUrl(url);
        }
    };
    let poll_timer = 0;
    let firstRequestFinished = false;

    async function sendRequest() {
        let ticketCount = await youTrack.GetTicketsCount();
        let title = settings["yt-search-name"] + "\n" + ticketCount;
        firstRequestFinished = true;
        console.log("updating title: " + title);
        $SD.setTitle(context, title);
    }

    function restartPeriodicPoll() {
        destroy();
        firstRequestFinished = false;
        youTrack.token = settings["yt-token"];
        youTrack.url = settings["yt-url"];
        youTrack.searchQuery = settings["yt-search-query"];
        youTrack.ready = true;
        refreshTitleWhilePolling();
        poll_timer = 1;
        startPollingLoop()

    }

    function startPollingLoop() {
        let delay = settings["refreshInterval"] || 60;
        setTimeout(async () => {
            await sendRequest()
            if (poll_timer !== 0) {
                startPollingLoop();
            } else {
                console.log("polling stopped");
            }
        }, delay * 1000);
    }
    function refreshTitleWhilePolling() {
        let dots = "";
        let id = setInterval(() => {
            if (!firstRequestFinished) {
                dots += ".";
                if (dots.length > 3) { dots = ""; }
                let title = settings["yt-search-name"] + "\n" + dots;
                $SD.setTitle(context, title);
            } else {
                clearInterval(id);
            }
        }, 1000);
    }

    function destroy() {
        poll_timer = 0;
    }

    function updateSettings(new_settings) {
        settings = new_settings;
        restartPeriodicPoll();
    }

    function OpenPage() {
        youTrack.OpenPage();
    }

    restartPeriodicPoll();

    return {
        sendRequest: sendRequest,
        updateSettings: updateSettings,
        destroy: destroy,
        OpenPage: OpenPage
    };

}

/**
 * The first event fired when Stream Deck starts
 */
$SD.onConnected(({actionInfo, appInfo, connection, messageType, port, uuid}) => {
    console.log('Stream Deck connected!');
});

myAction.onKeyUp(({action, context, device, event, payload}) => {
    const api_request = myAction.cache[context];
    if (!api_request)
        $SD.showAlert(context);
    else
        api_request.OpenPage();
});
myAction.onDidReceiveSettings(({action, context, device, event, payload}) => {
    const settings = payload.settings;
    const api_request = myAction.cache[context];

    if (!settings || !api_request) return;

    api_request.updateSettings(settings);
    myAction.cache[context] = api_request;
})
myAction.onSendToPlugin(async ({action, context, device, event, payload}) => {
    if (action === 'com.jetbrains.youtrack.get-ticket-count') {
        myAction.cache[context] = new APIRequest(context, payload.settings);
    }

});
myAction.onWillAppear(async ({action, context, device, event, payload}) => {
    myAction.cache[context] = new APIRequest(context, payload.settings);
})
myAction.onWillDisappear(async ({action, context, device, event, payload}) => {
    let api_request = myAction.cache[context];
    if (api_request) {
        api_request.destroy();
        delete myAction.cache[context];
    }
})



