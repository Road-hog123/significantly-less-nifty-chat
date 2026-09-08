// ==UserScript==
// @name           Significantly Less Nifty Chat
// @namespace      https://roadhog123.co.uk/
// @description    inlines Images, GIPHY GIFs & YouTube Thumbnails in Twitch chat
// @match          *://www.twitch.tv/*
// @match          *://m.twitch.tv/*
// @version        1.8
// @updateURL      https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @downloadURL    https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/master/chat-monitor.user.js
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_deleteValue
// @grant          GM_addStyle
// @grant          GM_getResourceText
// @grant          window.onurlchange
// @resource style https://raw.githubusercontent.com/road-hog123/significantly-less-nifty-chat/refs/tags/v1.4/chat-monitor.css
// ==/UserScript==

// non-blocking stylesheet injection
GM.getResourceText("style").then(GM.addStyle);

const EVENT = "DBEx2026";
// userscript storage keys
const K_REMINDERS = "hideReminders";
const K_REMINDERS_OLD = "hideRemindersUntil";
// update from previous userscript storage location
if (GM_getValue(K_REMINDERS_OLD, 0) > Date.now()) {
    GM_setValue(K_REMINDERS, EVENT);
    GM_deleteValue(K_REMINDERS_OLD);
}

// pages where the script should not look for a chat container
const EXCLUDED_PATH_SEGMENTS = new Map([
    // zeroth item is empty string before first path separator
    [
        1,
        new Set([
            "",
            "activity",
            "directory",
            "downloads",
            "drops",
            "inventory",
            "jobs",
            "p",
            "privacy",
            "settings",
            "subscriptions",
            "team",
            "turbo",
            "videos",
            "wallet",
        ]),
    ],
    [2, new Set(["clip"])],
    [-1, new Set(["about", "clips", "home", "schedule", "videos"])],
]);
function hasChat() {
    const path_segments = window.location.pathname.split("/");
    for (const [index, values] of EXCLUDED_PATH_SEGMENTS) {
        if (values.has(path_segments.at(index))) return false;
    }
    return true;
}

// matches against a pathname that ends with a image or video file extension
const RE_DIRECT = /^\/.+\.(?:jpe?g|png|gif|avif|webp|mp4)$/i;
// matches against an imgur image/album/gallery pathname
// album is truthy when the link is to an album/gallery (collection of multiple images)
// id is the alphanumeric hash, ignoring the hyphen-separated prefix
const RE_IMGUR = /^\/(?<album>(?:a|gallery)\/)?(?:\w+-)*(?<id>\w+)$/i;
// matches against a Giphy pathname, looks like a similar format to imgur
const RE_GIPHY = /^\/(?:gifs\/)?(?:\w+-)*(?<id>\w+)$/i;
// matches against youtube.com and youtu.be video links
// id is base64 video id
const RE_YOUTUBE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)(?<id>[\w-]+)/i;
// matches against twitter/x pathname
// user is alphanumeric (and underscores) between 4 and 15 characters
// id is unsigned integer (64 bit, so must be handled as string)
const RE_TWITTER = /^\/(?<user>\w{4,15})\/status\/(?<id>\d+)$/i;

const CHAT = ".chat-scrollable-area__message-container";
const CHAT_LINK = "a.link-fragment";
const CHAT_MESSAGE = `.chat-line__message-container:has(${CHAT_LINK})`;
const DARK_MODE = "tw-root--theme-dark";

// imgur is blocked in the UK; images are replaced with a "Content not viewable
// in your region" image which takes up lots of space in chat. Tests against
// imgur.com, i.imgur.com and invalid API URLs fail due to CORS issues, but a
// valid API URL without an auth token gets a 401 response, or 403 if blocked.
const IMGUR_TEST = new URL("https://api.imgur.com/3/gallery.json");
const IMGUR_BLOCKED = await fetch(IMGUR_TEST, { method: "HEAD" }).then(
    response => {
        console.debug(`imgur responded with status ${response.status}`);
        return response.status === 403;
    },
    error => {
        console.error(`imgur block test failed: ${error}`);
        return true;
    },
);
console.info(`imgur is ${IMGUR_BLOCKED ? "" : "un"}blocked`);

const CACHE = new Map();

let location;
let container;
let reminder;

class ImageOrVideo {
    #url;
    constructor(url) {
        if (url.hostname === "media.giphy.com") url.hostname = "media1.giphy.com";
        else if (url.hostname === "i.imgur.com" && IMGUR_BLOCKED) {
            url.href = `https://proxy.duckduckgo.com/iu/?u=${url}`;
        }
        this.#url = url;
    }

    getAppendableElement() {
        const video = this.#url.pathname.endsWith("mp4");
        const element = document.createElement(video ? "video" : "img");
        element.style.display = "none";
        const show = () => element.removeAttribute("style");
        element.addEventListener(video ? "canplay" : "load", show, { once: true });
        element.src = this.#url;
        if (video) {
            element.autoplay = element.loop = element.muted = true;
        }
        console.debug(`Inlining ${video ? "video" : "image"} with url '${this.#url}'`);
        return element;
    }

    static fromImgurLink(url) {
        const match = url.pathname.match(RE_IMGUR);
        if (!match) {
            console.debug(`imgur.com link '${url.pathname}' did not match regex`);
            return null;
        }
        if (match.groups.album) return reminder;
        return new ImageOrVideo(new URL(`https://i.imgur.com/${match.groups.id}.gif`));
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
            console.debug(`youtube link '${url}' did not match regex`);
            return null;
        }
        return new ImageOrVideo(new URL(`https://img.youtube.com/vi/${match.groups.id}/mqdefault.jpg`));
    }
}

class Tweet {
    #url;
    constructor(url) {
        this.#url = url;
    }

    getAppendableElement() {
        const blockquote = document.createElement("blockquote");
        blockquote.className = "twitter-tweet";
        blockquote.setAttribute("data-conversation", "none");
        blockquote.setAttribute("data-dnt", "true");
        if (document.documentElement.classList.contains(DARK_MODE)) {
            blockquote.setAttribute("data-theme", "dark");
        }
        const a = document.createElement("a");
        a.href = this.#url;
        const script = document.createElement("script");
        script.src = "https://platform.twitter.com/widgets.js";
        blockquote.append(a, script);
        console.debug(`Inlining tweet with url '${this.#url}'`);
        return blockquote;
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
    static #dismissReminders() {
        // prevent new links from creating reminders
        reminder = null;
        // prevent cached links from inlining reminders
        CACHE.forEach((value, key) => {
            if (value instanceof Reminder) CACHE.set(key, null);
        });
        // remove any existing reminders
        container.querySelectorAll("div.notice").forEach(notice => notice.remove());
    }

    static #hideReminders() {
        Reminder.#dismissReminders();
        // prevent reminders from showing after a reload
        GM_setValue(K_REMINDERS, EVENT);
    }

    getAppendableElement() {
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
        dismiss.addEventListener("click", Reminder.#dismissReminders);
        const hide = document.createElement("button");
        hide.textContent = "Hide until next DB";
        hide.addEventListener("click", Reminder.#hideReminders);
        dismiss.type = hide.type = "button";
        const buttons = document.createElement("div");
        buttons.append(dismiss, hide);
        notice.append(message, buttons);
        return notice;
    }
}

function processNewLink(url) {
    // if the pathname ends with an image/video file extension then it can be inlined without special treatment
    if (RE_DIRECT.test(url.pathname)) return new ImageOrVideo(url);
    // not sure if this is the best solution, but direct string matching seems better than regex?
    switch (url.hostname) {
        case "imgur.com":
            if (url.pathname.startsWith("/album/")) break;
            return ImageOrVideo.fromImgurLink(url);
        case "gyazo.com":
            if (url.pathname.startsWith("/collections/")) break;
            return reminder;
        case "tenor.com":
            return reminder;
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
    console.debug(`Detected link '${link.href}'`);
    if (!URL.canParse(link.href)) return null;
    const url = new URL(link.href);
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

function onMessage(message) {
    // process each link within the message
    message.querySelectorAll(CHAT_LINK).forEach(link => {
        const element = processLink(link)?.getAppendableElement();
        if (element) message.append(element);
    });
}

// Observer that watches for new chat messages
const MESSAGE_OBSERVER = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            const message = node.querySelector?.(CHAT_MESSAGE);
            if (message) onMessage(message);
        });
    });
});

function onChatLoad(element) {
    container = element;
    console.debug("Inlining any existing chat messages with links...");
    container.querySelectorAll(CHAT_MESSAGE).forEach(onMessage);
    console.debug("Monitoring for new chat messages with links...");
    MESSAGE_OBSERVER.observe(container, { childList: true });
}

// Observer that watches for a recognisable chat container
const CONTAINER_OBSERVER = new MutationObserver(mutations => {
    mutations.some(mutation => {
        if (!mutation.target.matches?.(CHAT)) return false;
        CONTAINER_OBSERVER.disconnect();
        onChatLoad(mutation.target);
        return true;
    });
});
function waitForChat() {
    console.debug("Waiting for a chat window...");
    CONTAINER_OBSERVER.observe(document.body, { childList: true, subtree: true });
}

function onLocationChange() {
    const newLocation = window.location.pathname;
    // disregard spurious location changes, changes to anchor/query, etc.
    if (newLocation === location) return;
    console.debug(`Navigated${location ? ` from ${location}` : ""} to ${newLocation}`);
    location = newLocation;

    CONTAINER_OBSERVER.disconnect();
    // ignore pages without chat
    if (!hasChat()) return;
    // try to find an existing chat window
    const chat = document.querySelector(CHAT);
    if (chat) {
        if (chat === container) return; // already observing this chat window
        return onChatLoad(chat);
    }
    waitForChat();
}

if (GM_getValue(K_REMINDERS, "") !== EVENT) reminder = new Reminder();
console.info(`Usage reminders ${reminder ? "en" : "dis"}abled`);
onLocationChange();

if ("navigation" in window) {
    // Navigation API is supported
    navigation.addEventListener("navigatesuccess", onLocationChange);
} else if (window.onurlchange === null) {
    // User Script API supports window.onurlchange
    window.addEventListener("urlchange", onLocationChange);
}
