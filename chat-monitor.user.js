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
const RE_DIRECT = /\/.+\.(?:jpe?g|png|gif|avif|webp|mp4)$/i;
// matches against an imgur image/album/gallery pathname
// album is truthy when the link is to an album/gallery (collection of multiple images)
// id is the alphanumeric hash, ignoring the hyphen-separated prefix
const RE_IMGUR = /\/(?<album>(?:a|gallery)\/)?(?:\w+-)*(?<id>\w+)$/i;
// matches against a Giphy pathname, looks like a similar format to imgur
const RE_GIPHY = /\/(?:\w+-)?(?<id>\w+)$/i;
// matches against youtube.com and youtu.be video links
// id is base64 video id
const RE_YOUTUBE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)(?<id>[\w-]+)/i;
// matches against twitter/x pathname
// user is alphanumeric (and underscores) between 4 and 15 characters
// id is unsigned integer (64 bit, so must be handled as string)
const RE_TWITTER = /\/(?<user>\w{4,15})\/status\/(?<id>\d+)/i;
// matches against bluesky pathname
// user can use a custom domain—might need to expand the allowed characters
// post is alphanumeric
const RE_BLUESKY = /\/profile\/(?<user>[\w\.]+)\/post\/(?<post>\w+)/i;
// matches against mastodon pathname
// id is unsigned integer
const RE_MASTODON = /\/@\w+(?:@\w+(?:\.\w+)+)?\/(?<id>\d+)/i;

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

async function processLink(parent, link) {
    console.debug(`Detected link '${link.href}' ...`)
    const url = new URL(link.href);
    // if the pathname ends with an image/video file extension then it can be inlined without special treatment
    let match = url.pathname.match(RE_DIRECT);
    if (match) {
        return linkImageOrVideo(parent, url);
    }
    // not sure if this is the best solution, but direct string matching seems better than regex?
    switch (url.hostname) {
        case "imgur.com":
            return linkImgur(parent, url);
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
        case "bsky.app":
            return linkBluesky(parent, url);
        default:
            if (await isMastodon(url)) {
                return linkMastodon(parent, url);
            }
    }
    console.debug("Link was not inlined.")
}

async function isMastodon(url) {
    // mastodon urls have very little in common
    if (!url.pathname.startsWith("/@")) return false;
    // the only reliable way to tell is to make a request
    console.debug(`Testing if '${url.origin}' is a Mastodon instance ...`);
    const response = await fetch(`${url.origin}/.well-known/nodeinfo`);
    if (!response.ok) return false;
    const json = await response.json();
    return json.links.some(a=>a.rel == "http://nodeinfo.diaspora.software/ns/schema/2.0");
}

async function linkImgur(parent, url) {
    const match = url.pathname.match(RE_IMGUR);
    if (!match) {
        console.debug(`imgur.com link '${url.pathname}' did not match regex`);
        return;
    }
    var apiLink = "https://api.imgur.com/3/" + ((match.groups.album) ? `album/${match.groups.id}/images` : `image/${match.groups.id}`);
    var content = await ((await fetch(apiLink, { "headers": { "Authorization": "Client-ID db1c3074b0b7efc" } })).json());
    var image = (match.groups.album) ? content.data[0] : content.data;
    linkImageOrVideo(parent, new URL((Object.hasOwn(image, "mp4") && image.mp4) ? image.mp4 : image.link));
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

function linkMicroblog(parent, avatarUrl, userUrl, username, dispname, content) {
    const fragment = document.createDocumentFragment();
    const article = document.createElement("article");
    fragment.appendChild(article);
    article.style.margin = ".25em auto 0";
    article.style.border = "1px solid #fff";
    article.style.borderRadius = "1em";
    article.style.padding = ".5em";
    const author = document.createElement("a");
    article.appendChild(author);
    author.href = userUrl;
    author.rel = "author nofollow noopener noreferrer";
    author.target = "_blank";
    const avatar = document.createElement("img");
    author.appendChild(avatar);
    avatar.src = avatarUrl;
    avatar.style.height = avatar.style.width = "2lh";
    avatar.style.borderRadius = ".5em";
    const names = document.createElement("div");
    author.appendChild(names);
    names.style.display = "inline-block";
    names.style.marginLeft = ".5em";
    const display = document.createElement("span");
    names.appendChild(display);
    display.textContent = dispname;
    display.style.fontWeight = "bold";
    names.appendChild(document.createElement("br"));
    const user = document.createElement("span");
    names.appendChild(user);
    user.textContent = username;
    article.innerHTML += content;
    article.querySelector("p").style.marginTop = ".5em";
    parent.appendChild(fragment);
}

async function linkBluesky(parent, url) {
    const match = url.pathname.match(RE_BLUESKY);
    if (!match) {
        console.debug(`bluesky link '${url.pathname}' did not match regex`);
        return;
    }
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=at://${match.groups.user}/app.bsky.feed.post/${match.groups.post}&depth=0&parentHeight=0`);
    if (!response.ok) {
        console.log(`Request to ${response.url} failed`);
        return;
    }
    const json = await response.json();
    linkMicroblog(
        parent,
        json.thread.post.author.avatar,
        `https://bsky.app/profile/${json.thread.post.author.handle}`,
        "@" + json.thread.post.author.handle,
        json.thread.post.author.displayName,
        `<p>${json.thread.post.record.text}</p>`,
    );
}

async function linkMastodon(parent, url) {
    const match = url.pathname.match(RE_MASTODON);
    if (!match) {
        console.debug(`mastodon link '${url.pathname}' did not match regex`);
        return;
    }
    const response = await fetch(`${url.origin}/api/v1/statuses/${match.groups.id}`);
    if (!response.ok) {
        console.log(`Request to ${response.url} failed`);
        return;
    }
    const json = await response.json();
    linkMicroblog(
        parent,
        json.account.avatar,
        json.account.url,
        "@" + json.account.username + "@" + (new URL(json.account.url)).hostname,
        json.account.display_name,
        json.content,
    );
}
