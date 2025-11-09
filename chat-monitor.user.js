// ==UserScript==
// @name           Significantly Less Nifty Chat
// @namespace      https://roadhog123.co.uk/
// @description    inlines Images, GIPHY GIFs & YouTube Thumbnails in Twitch chat
// @match          https://www.twitch.tv/*
// @version        1.3
// @updateURL      https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @downloadURL    https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @grant          GM_addStyle
// @grant          GM_getResourceText
// @resource style https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.css
// ==/UserScript==

// inject stylesheet
GM_addStyle(GM_getResourceText("style"));

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

const CHAT_LIST = ".chat-scrollable-area__message-container, #seventv-message-container .seventv-chat-list";
const CHAT_MESSAGE = ".chat-line__message-container";
const CHAT_LINK = "a.link-fragment, .seventv-chat-message-body a";

waitForElement(CHAT_LIST).then(onChatLoad);

function waitForElement(selector) {
    return new Promise(resolve => {
        // if life were simple the chat window would exist when the script runs...
        const element = document.querySelector(selector);
        if (element) {
            return resolve(element);
        }
        // but chances are we'll have to watch the whole document tree,
        // waiting for an element to be modified into a form we can recognise as "chat window"...
        // (no, the element is not *added* in a form we can recognise, the class is added later...)
        const observer = new MutationObserver(mutations => {
            mutations.some(mutation => {
                if (mutation.target.matches?.(selector)) {
                    observer.disconnect();
                    return resolve(mutation.target);
                }
            })
        });
        observer.observe(document.body, {childList: true, subtree: true});
    });
}

function onChatLoad(container) {
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(newNode => {
                // the parent node for our image/video/post
                const parent = newNode.querySelector(CHAT_MESSAGE);
                if (!parent) return; // new node was not a message
                // process each link within the message
                const processLink_ = link => processLink(parent, link);
                parent.querySelectorAll(CHAT_LINK).forEach(processLink_);
            });
        });
    });

    // monitor chat room for the addition or removal or child nodes (usually messages)
    observer.observe(container, {childList: true});
}

function processLink(parent, link) {
    console.debug(`Detected link '${link.href}' ...`);
    const url = new URL(link.href);
    // if the pathname ends with an image/video file extension then it can be inlined without special treatment
    if (url.pathname.match(RE_DIRECT)) {
        linkImageOrVideo(parent, url);
        return;
    }
    // not sure if this is the best solution, but direct string matching seems better than regex?
    switch (url.hostname) {
        case "giphy.com":
            linkGiphy(parent, url);
            return;
        case "youtu.be":
        case "youtube.com":
        case "www.youtu.be":
        case "www.youtube.com":
            linkYouTube(parent, url);
            return;
        case "x.com":
        case "twitter.com":
            linkTwitter(parent, url);
            return;
    }
    console.debug("Link was not inlined.");
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
    const video = url.pathname.endsWith("mp4");
    console.debug(`Inlining ${(video) ? "video" : "image"} with url '${url.href}'`);
    const elem = document.createElement((video) ? "video" : "img");
    parent.appendChild(elem);
    elem.style.display = "none";
    elem.src = url.href.replace("media.giphy.com", "media1.giphy.com");
    if (video) {
        elem.autoplay = elem.loop = elem.muted = true;
    }
    elem.addEventListener((video) ? "canplay" : "load", () => elem.style.removeProperty("display"));
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
