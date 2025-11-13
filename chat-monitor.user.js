// ==UserScript==
// @name           Significantly Less Nifty Chat
// @namespace      https://roadhog123.co.uk/
// @description    inlines Images, GIPHY GIFs & YouTube Thumbnails in Twitch chat
// @match          https://www.twitch.tv/*
// @version        1.4
// @updateURL      https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @downloadURL    https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_addStyle
// @grant          GM_getResourceText
// @resource style https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/refs/tags/v1.4/chat-monitor.css
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

const CHAT_LIST = ".chat-scrollable-area__message-container, #seventv-message-container .seventv-chat-list";
const CHAT_MESSAGE = ".chat-line__message-container";
const CHAT_LINK = "a.link-fragment, .seventv-chat-message-body a";
const DARK_MODE = "tw-root--theme-dark";

const CACHE = new Map();

class ImageOrVideo {
    constructor(url) {
        this.url = url;
        this.video = url.pathname.endsWith("mp4");
    }

    getAppendableElement() {
        const element = document.createElement(this.video ? "video" : "img");
        element.style.display = "none";
        element.addEventListener(this.video ? "canplay" : "load", () => element.style.display = "");
        element.src = this.url.href;
        if (this.video) {
            element.autoplay = element.loop = element.muted = true;
        }
        console.debug(`Inlining ${(this.video) ? "video" : "image"} with url '${element.src}'`);
        return element;
    }

    static fromDirectLink(url) {
        switch (url.hostname) {
            case "media.giphy.com":
                url.hostname = "media1.giphy.com";
                break;
            case "i.imgur.com":
                if (imgurBlocked) {
                    url.href = "https://proxy.duckduckgo.com/iu/?u=" + url.href;
                }
                break;
        }
        return new ImageOrVideo(url);
    }

    static fromGiphyLink(url) {
        const match = url.pathname.match(RE_GIPHY);
        if (!match) {
            console.debug(`giphy.com link '${url.pathname}' did not match regex`);
            return null;
        }
        return new ImageOrVideo(new URL(`https://media1.giphy.com/media/${match.groups.id}/giphy.gif`));
    }

    static fromYouTubeLink(url) {
        const match = url.href.match(RE_YOUTUBE);
        if (!match) {
            console.debug(`youtube link '${url.href}' did not match regex`);
            return null;
        }
        return new ImageOrVideo(new URL(`https://img.youtube.com/vi/${match.groups.id}/mqdefault.jpg`));
    }
}

// https://stackoverflow.com/a/47614491
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

class Tweet {
    constructor(url) {
        this.url = url;
    }

    getAppendableElement() {
        const darkmode = document.documentElement.classList.contains(DARK_MODE);
        const element = document.createElement("div");
        const innerHTML = `<blockquote data-conversation="none" data-dnt="true" ${darkmode ? 'data-theme="dark"' : ''} class="twitter-tweet"><a href="${this.url.href}"></a><script src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></blockquote>`;
        setInnerHTMLAndExecuteScript(element, innerHTML);
        console.debug(`Inlining tweet with url '${this.url.href}'`);
        return element;
    }

    static fromTweetLink(url) {
        const match = url.pathname.match(RE_TWITTER);
        if (!match) {
            console.debug(`twitter link '${url.pathname}' did not match regex`);
            return null;
        }
        return new Tweet(new URL(`https://twitter.com/${match.groups.user}/status/${match.groups.id}`));
    }
}

class Reminder {
    static dismissReminders() {
        reminders = false;
        document.querySelectorAll("div.notice").forEach(notice => notice.remove());
    }

    static hideReminders() {
        Reminder.dismissReminders();
        // approximately 359 days in the future
        GM_setValue("hideRemindersUntil", Date.now() + 31000000000);
    }

    getAppendableElement() {
        if (!reminders) return null;
        const notice = document.createElement("div");
        notice.className = "notice";
        const message = document.createElement("i");
        message.append(
            "This link cannot be inlined,",
            document.createElement("br"),
            "please use the direct image link instead.",
        );
        const dismiss = document.createElement("button");
        dismiss.textContent = "Dismiss";
        dismiss.addEventListener("click", Reminder.dismissReminders);
        const hide = document.createElement("button");
        hide.textContent = "Hide for 1 year";
        hide.addEventListener("click", Reminder.hideReminders);
        dismiss.type = hide.type = "button";
        const buttons = document.createElement("div");
        buttons.append(dismiss, hide);
        notice.append(message, buttons);
        return notice;
    }
}

function processNewLink(url) {
    // if the pathname ends with an image/video file extension then it can be inlined without special treatment
    if (url.pathname.match(RE_DIRECT)) {
        return ImageOrVideo.fromDirectLink(url);
    }
    // not sure if this is the best solution, but direct string matching seems better than regex?
    switch (url.hostname) {
        case "imgur.com":
            if (url.pathname.startsWith("/album/")) break;
        case "gyazo.com":
            if (url.pathname.startsWith("/collections/")) break;
        case "tenor.com":
            return new Reminder();
        case "giphy.com":
            return ImageOrVideo.fromGiphyLink(url);
        case "youtu.be":
        case "youtube.com":
        case "www.youtu.be":
        case "www.youtube.com":
            return ImageOrVideo.fromYouTubeLink(url);
        case "x.com":
        case "twitter.com":
            return Tweet.fromTweetLink(url);
    }
    return null;
}

function processLink(link) {
    let url;
    try {
        url = new URL(link.href);
    } catch {
        console.debug("URL could not be parsed!");
        return null;
    }
    // ignore scheme, port, username/password and hash
    const key = url.hostname + url.pathname + url.search;
    const cached = CACHE.get(key);
    if (cached !== undefined) {
        console.debug(`Cache Hit! '${key}'`);
        return cached; // null is an acceptable value
    }
    const result = processNewLink(url);
    CACHE.set(key, result);
    return result;
}

function onAddedNode(node) {
    // the parent node for our image/video/post
    const parent = node.querySelector(CHAT_MESSAGE);
    if (!parent) return; // new node was not a message
    // process each link within the message
    parent.querySelectorAll(CHAT_LINK).forEach(link => {
        console.debug(`Detected link '${link.href}' ...`);
        const result = processLink(link);
        if (!result) {
            console.debug("Link was not inlined.");
            return;
        }
        parent.append(result.getAppendableElement());
    });
}

function onChatLoad(container) {
    // monitor chat room for the addition or removal of child nodes (usually messages)
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(onAddedNode);
        });
    });
    observer.observe(container, {childList: true});
}

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

// we want to start observing for the chat list as early as possible so we don't miss it
waitForElement(CHAT_LIST).then(onChatLoad);
// non-blocking stylesheet injection
GM.getResourceText("style").then(GM.addStyle);
var reminders = GM_getValue("hideRemindersUntil", 0) < Date.now();
console.debug(`Usage reminders ${(reminders) ? "en" : "dis"}abled`);

async function isImgurBlocked() {
    // imgur.com and i.imgur.com block cross-origin requests, so new test with api.imgur.com
    const response = await fetch("https://api.imgur.com/", { method: "HEAD" });
    return response.status == 403;
}
const imgurBlocked = await isImgurBlocked();
