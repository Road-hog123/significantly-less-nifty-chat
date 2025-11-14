// ==UserScript==
// @name           Twitch Chat Inliner
// @namespace      https://roadhog123.co.uk/
// @description    inlines Images, GIPHY GIFs & YouTube Thumbnails in Twitch chat
// @match          https://www.twitch.tv/*
// @version        1.4
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_addStyle
// @grant          GM_getResourceText
// @resource style https://github.com/Road-hog123/significantly-less-nifty-chat/raw/dev/chat-monitor.css
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
// matches against bluesky pathname
// user can use a custom domain—might need to expand the allowed characters
// post is alphanumeric
const RE_BLUESKY = /\/profile\/(?<user>[\w\.]+)\/post\/(?<post>\w+)/i;
// matches against mastodon pathname
// id is unsigned integer
const RE_MASTODON = /\/@\w+(?:@\w+(?:\.\w+)+)?\/(?<id>\d+)/i;

const CHAT_LIST = ".chat-scrollable-area__message-container, #seventv-message-container .seventv-chat-list";
const CHAT_MESSAGE = ".chat-line__message-container";
const CHAT_LINK = "a.link-fragment, .seventv-chat-message-body a";
const DARK_MODE = "tw-root--theme-dark";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const CACHE = new Map();

class ImageOrVideo {
    constructor(url) {
        this.url = url;
        this.video = url.pathname.endsWith("mp4");
    }

    getElement() {
        const element = document.createElement(this.video ? "video" : "img");
        element.style.display = "none";
        element.addEventListener(this.video ? "canplay" : "load", () => { element.style.display = "" });
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

    getElement() {
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

    getElement() {
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

function facetURI(feature) {
    switch (feature.$type) {
        case "app.bsky.richtext.facet#mention":
            return `https://bsky.app/profile/${feature.did}`;
        case "app.bsky.richtext.facet#tag":
            return `https://bsky.app/hashtag/${feature.tag}`;
        case "app.bsky.richtext.facet#link":
            return feature.uri;
    }
    console.debug(`Facet ${feature.$type} not recognised`);
    return "";
}

function applyFacets(text, facets) {
    const content = document.createElement("p");
    content.style.whiteSpace = "pre-wrap";
    if (!facets) {
        content.append(text);
        return content.outerHTML;
    }
    const plaintext = ENCODER.encode(text);
    let postion = 0;
    facets.map(facet => {
        const start = facet.index.byteStart;
        const end = facet.index.byteEnd;
        content.append(DECODER.decode(plaintext.slice(postion, start)));
        const uri = facetURI(facet.features[0]);
        const element = document.createElement(uri ? "a" : "span");
        if (uri) {
            content.href = uri;
            content.rel = "external noreferrer";
            content.target = "_blank";
        }
        element.append(DECODER.decode(plaintext.slice(start, end)));
        content.append(element);
        postion = end;
    });
    content.append(DECODER.decode(plaintext.slice(postion)));
    return content.outerHTML;
}

async function handleEmbed(embed, author) {
    let result = {
        images: [],
        quote: null,
    }
    switch (embed.$type) {
        case "app.bsky.embed.external":
            break;
        case "app.bsky.embed.images":
            result.images = embed.images.map(image => {
                return {
                    src: `https://cdn.bsky.app/img/feed_thumbnail/plain/${author}/${image.image.ref.$link}`,
                    alt: image.alt,
                    size: {
                        height: image.aspectRatio.height,
                        width: image.aspectRatio.width,
                    },
                }
            });
            break;
        case "app.bsky.embed.record":
            result.quote = await MicroblogPost.fromBskyURI(embed.record.uri);
            break;
        case "app.bsky.embed.recordWithMedia":
            let images, quote;
            ({images, quote} = await handleEmbed(embed.media, author));
            result.images = images;
            ({images, quote} = await handleEmbed(embed.record, author));
            result.quote = quote;
            break;
        default:
            console.debug(`Unknown embed type '${embed.$type}'`);
    }
    return result;
}

async function requestJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
        console.debug(`Request to ${response.url} failed`);
        return null;
    }
    return response.json();
}

class MicroblogPost {
    static #cutoffs = [3600, 86400, 86400 * 7, 86400 * 30, 86400 * 365, Infinity];
    static #units = ["minute", "hour", "day", "week", "month", "year"];
    static #rtf = new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto", style: "narrow" });

    static getRelativeTimeString(timestamp) {
        const deltaSeconds = Math.round((Date.parse(timestamp) - Date.now()) / 1000);
        const unitIndex = MicroblogPost.#cutoffs.findIndex(cutoff => cutoff > Math.abs(deltaSeconds));
        const divisor = unitIndex ? MicroblogPost.#cutoffs[unitIndex - 1] : 60;
        return MicroblogPost.#rtf.format(Math.round(deltaSeconds / divisor), MicroblogPost.#units[unitIndex]);
    }

    constructor(avatar, username, dispname, timestamp, content, images = [], quote = null) {
        this.avatar = avatar;
        this.username = username;
        this.dispname = dispname ? dispname : username;
        this.timestamp = timestamp;
        this.content = content;
        this.images = images;
        this.quote = quote;
    }

    getElement() {
        const article = document.createElement("article");
        const header = document.createElement("header");
        article.appendChild(header);
        const avatar = document.createElement("img");
        header.appendChild(avatar);
        avatar.src = this.avatar;
        const author = document.createElement("address");
        header.appendChild(author);
        const display = document.createElement("bdi");
        display.textContent = this.dispname;
        author.append(display, document.createElement("br"), this.username);
        const timestamp = document.createElement("time");
        header.appendChild(timestamp);
        timestamp.dateTime = this.timestamp;
        timestamp.innerText = MicroblogPost.getRelativeTimeString(this.timestamp);
        article.innerHTML += this.content;
        if (this.images.length) {
            const ul = document.createElement("ul");
            this.images.map(image => {
                const li = document.createElement("li");
                const img = document.createElement("img");
                img.src = image.src;
                img.alt = image.alt;
                img.height = image.size.height;
                img.width = image.size.width;
                li.append(img);
                ul.append(li);
            });
            article.append(ul);
        }
        if (this.quote) {
            article.append(this.quote.getElement());
        }
        console.debug(`Inlining microblog post from '${this.username}'`);
        return article;
    }

    static async fromBskyLink(url) {
        const match = url.pathname.match(RE_BLUESKY);
        if (!match) {
            console.debug(`bluesky link '${url.pathname}' did not match regex`);
            return null;
        }
        const uri = `at://${match.groups.user}/app.bsky.feed.post/${match.groups.post}`;
        return await MicroblogPost.fromBskyURI(uri);
    }

    static async fromBskyURI(uri) {
        const json = await requestJSON(
            `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${uri}&depth=0&parentHeight=0`
        );

        const post = json.thread.post;
        const author = post.author;
        const record = post.record;
        const labels = post.labels;
        const hide_text = labels.some(label => label.val.startsWith("!"));
        const hide_media = hide_text || labels.length;
        let content = "<p><i>Content not shown due to moderation label(s).</i></p>";
        if (!hide_text) {
            content = applyFacets(record.text, record.facets);
        }
        let images = [];
        let quote = null;
        if (record.embed) {
            const embed = await handleEmbed(record.embed, author.did);
            if (hide_media) {
                content += `<p><i>${embed.images.length} image(s) not shown.</i></p>`;
            } else {
                images = embed.images;
            }
            quote = embed.quote;
        }
        return new MicroblogPost(
            author.avatar,
            `@${author.handle}`,
            author.displayName,
            record.createdAt,
            content,
            images,
            quote,
        );
    }

    static async fromMastodonLink(url) {
        const match = url.pathname.match(RE_MASTODON);
        if (!match) {
            console.debug(`mastodon link '${url.pathname}' did not match regex`);
            return null;
        }
        const uri = match.groups.id;
        const request_url = `${url.origin}/api/v1/statuses/${uri}`;
        const json = await requestJSON(request_url);

        let content = json.spoiler_text ? `<p><i>Spoiler: '${json.spoiler_text}'</i></p>` : json.content;
        let images = json.media_attachments.map(attachment => {
            return {
                src: attachment.preview_url,
                alt: attachment.description,
                size: {
                    height: attachment.meta.small.height,
                    width: attachment.meta.small.width,
                },
            }
        });
        if (json.sensitive) {
            content += `<p><i>${images.length} image(s) not shown.</i></p>`;
            images = [];
        }

        return new MicroblogPost(
            json.account.avatar,
            `@${json.account.username}@${(new URL(json.account.url)).hostname}`,
            json.account.display_name,
            json.created_at,
            json.spoiler_text ? `<p><i>Spoiler: '${json.spoiler_text}'</i></p>` : json.content,
            images,
        );
    }
}

async function isMastodon(url) {
    // mastodon urls have very little in common
    if (!url.pathname.startsWith("/@")) return false;
    // attempt to read value from storage
    const cachedValue = GM_getValue(url.hostname, null);
    if (cachedValue !== null) return cachedValue;
    // the only reliable way to tell is to make a request
    console.debug(`Testing if '${url.origin}' is a Mastodon instance ...`);
    const response = await fetch(`${url.origin}/.well-known/nodeinfo`);
    // in case of server error, do not cache negative result
    if (response.status >= 500) return false;
    // 404, etc. should be regarded as negative result
    if (!response.ok) {
        GM_setValue(url.hostname, false);
        return false;
    }
    // otherwise test for and store result
    const json = await response.json();
    const result = json.links.some(a=>a.rel == "http://nodeinfo.diaspora.software/ns/schema/2.0");
    GM_setValue(url.hostname, result);
    return result;
}

async function processNewLink(url) {
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
        case "bsky.app":
            return await MicroblogPost.fromBskyLink(url);
        default:
            if (await isMastodon(url)) {
                return await MicroblogPost.fromMastodonLink(url);
            }
    }
    return null;
}

async function processLink(link) {
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
    const result = await processNewLink(url);
    CACHE.set(key, result);
    return result;
}

async function onAddedNode(node) {
    // the parent node for our image/video/post
    const parent = node.querySelector(CHAT_MESSAGE);
    if (!parent) return; // new node was not a message
    // process each link within the message
    for (const link of parent.querySelectorAll(CHAT_LINK)) {
        console.debug(`Detected link '${link.href}' ...`);
        const result = await processLink(link);
        if (!result) {
            console.debug("Link was not inlined.");
            return;
        }
        parent.append(result.getElement());
    };
}

function onChatLoad(container) {
    // monitor chat room for the addition or removal of child nodes (usually messages)
    const observer = new MutationObserver(async mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                await onAddedNode(node);
            }
        }
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
