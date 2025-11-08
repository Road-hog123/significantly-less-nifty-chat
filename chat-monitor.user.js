// ==UserScript==
// @name           Significantly Less Nifty Chat
// @namespace      https://roadhog123.co.uk/
// @description    inlines Images, GIPHY GIFs & YouTube Thumbnails in Twitch chat
// @match          https://www.twitch.tv/*
// @version        1.3
// @updateURL      https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @downloadURL    https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @require        https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js
// @require        https://gist.github.com/raw/2625891/waitForKeyElements.js
// ==/UserScript==

// matches against a pathname that ends with a image or video file extension
const RE_DIRECT = /^\/.+\.(?:jpe?g|png|gif|avif|webp|mp4)$/i;
// matches against a Giphy pathname
// id is the alphanumeric hash, ignoring the hyphen-separated prefix
const RE_GIPHY = /^\/(?:gifs\/)?(?:\w+-)*(?<id>\w+)$/i;
// matches against youtube.com and youtu.be video links
// id is base64 video id
const RE_YOUTUBE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)(?<id>[\w-]+)/i;
// matches against twitter/x pathname
// user is alphanumeric (and underscores) between 4 and 15 characters
// id is unsigned integer (64 bit, so must be handled as string)
const RE_TWITTER = /^\/(?<user>\w{4,15})\/status\/(?<id>\d+)$/i;

const MESSAGE_CONTAINER = ".chat-scrollable-area__message-container, #seventv-message-container .seventv-chat-list";
waitForKeyElements(MESSAGE_CONTAINER, onChatLoad);

function onChatLoad() {
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(newNode) {
                // the parent node for our image/video/post
                let parent = newNode.querySelector(".chat-line__message-container");
                if (parent === null) return; // new node was not a message

                // process each link within the message
                parent.querySelectorAll("a.link-fragment, .seventv-chat-message-body a")
                    .forEach(function(link) { processLink(parent, link) });
            });
        });
    });

    // monitor chat room for the addition or removal or child nodes (usually messages)
    observer.observe(document.querySelector(MESSAGE_CONTAINER), {childList: true});
}

function processLink(parent, link) {
    console.debug(`Detected link '${link.href}' ...`)
    const url = new URL(link.href);
    // if the pathname ends with an image/video file extension then it can be inlined without special treatment
    let match = url.pathname.match(RE_DIRECT);
    if (match) {
        return linkImageOrVideo(parent, url);
    }
    // not sure if this is the best solution, but direct string matching seems better than regex?
    switch (url.hostname) {
        case "giphy.com":
            return linkGiphy(parent, url);
        case "youtu.be":
        case "youtube.com":
        case "www.youtu.be":
        case "www.youtube.com":
            return linkYouTube(parent, url);
        case "x.com":
        case "twitter.com":
            return linkTwitter(parent, url);
    }
    console.debug("Link was not inlined.")
}

function linkGiphy(parent, url) {
    const match = url.pathname.match(RE_GIPHY);
    if (!match) {
        console.debug(`giphy.com link '${url.pathname}' did not match regex`);
        return;
    }
    linkImageOrVideo(parent, new URL(`https://media1.giphy.com/media/${match.groups.id}/giphy.gif`));
}

function linkYouTube(parent, url) {
    const match = url.href.match(RE_YOUTUBE);
    if (!match) {
        console.debug(`youtube link '${url.href}' did not match regex`);
        return;
    }
    linkImageOrVideo(parent, new URL(`https://img.youtube.com/vi/${match.groups.id}/mqdefault.jpg`));
}

function linkImageOrVideo(parent, url) {
    console.debug(`Inlining image or video with url '${url.href}'`);
    const video = url.pathname.endsWith("mp4")
    const elem = document.createElement((video) ? "video" : "img");
    parent.appendChild(elem);
    elem.style.display = "none";
    elem.style.maxWidth = "100%";
    elem.style.maxHeight = "50vh";
    elem.style.margin = "0.25em auto 0";
    elem.src = url.href.replace("media.giphy.com", "media1.giphy.com");
    if (video) {
        elem.autoplay = elem.loop = elem.muted = true;
    }
    elem.addEventListener((video) ? "canplay" : "load", function() {elem.style.display = "block"})
}

function setInnerHTMLAndExecuteScript(node, html) {
    node.innerHTML = html;
    Array.from(node.querySelectorAll("script"))
        .forEach( oldScriptElement => {
            const newScriptElement = document.createElement("script");
            Array.from(oldScriptElement.attributes).forEach( attr => {
                newScriptElement.setAttribute(attr.name, attr.value)
            });
            const scriptText = document.createTextNode(oldScriptElement.innerHTML);
            newScriptElement.appendChild(scriptText);
            oldScriptElement.parentNode.replaceChild(newScriptElement, oldScriptElement);
    });
}

function linkTwitter(parent, url) {
    console.debug(`Inlining tweet with url '${url.href}'`);
    const match = url.pathname.match(RE_TWITTER);
    if (!match) {
        console.debug(`twitter link '${url.pathname}' did not match regex`);
        return;
    }
    const sanitizedURL = `https://twitter.com/${match.groups.user}/status/${match.groups.id}`;
    const tweetHTML = `<blockquote data-conversation="none" data-dnt="true" ${(document.documentElement.classList.contains("tw-root--theme-dark") ? 'data-theme="dark"' : '')} class="twitter-tweet"><a href="${sanitizedURL}"></a><script src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></blockquote>`;
    var tweet = document.createElement("div");
    parent.appendChild(tweet);
    setInnerHTMLAndExecuteScript(tweet, tweetHTML);
}
