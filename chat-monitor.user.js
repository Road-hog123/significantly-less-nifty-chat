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
// @grant          GM_log
// ==/UserScript==

var MESSAGE_CONTAINER = ".chat-scrollable-area__message-container, #seventv-message-container .seventv-chat-list";
waitForKeyElements(MESSAGE_CONTAINER, onChatLoad);

function onChatLoad() {
    // The node to be monitored
    var target = document.querySelector(MESSAGE_CONTAINER);

    // Create an observer instance
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            // Get list of new nodes
            var newNodes = mutation.addedNodes;

            // Check if there are new nodes added
            if (newNodes == null) {
                return;
            }

            newNodes.forEach(function(newNode) {
                if (newNode.nodeType !== Node.ELEMENT_NODE) {
                    return;
                }

                // Only treat chat messages
                if (newNode.firstChild === null || !(newNode.firstChild.classList.contains("chat-line__message") || newNode.firstChild.classList.contains("seventv-message"))) {
                    return;
                }

                //add inline images
                newNode.querySelectorAll(".chat-line__message a.link-fragment, .seventv-chat-message-body a")
                    .forEach(async function(link) {
                        let match = /imgur\.com\/((?:a|gallery)\/)?(?:\w+-)*(\w+)$/gim.exec(link.href);
                        let url = ((match) ? await getImgurLink(match[1], match[2]) : link.href);
                        let imageLink = getImageLink(url);
                        if (imageLink) {
                            linkImage(newNode.firstChild, imageLink);
                            return;
                        }
                        let videoLink = getVideoLink(url);
                        if (videoLink) {
                            linkVideo(newNode.firstChild, videoLink);
                            return;
                        }
                        let giphyLink = getGiphyLink(link.href);
                        if (giphyLink) {
                            linkImage(newNode.firstChild, giphyLink);
                            return;
                        }
                        let thumbnailLink = getYouTubeLink(link.href);
                        if (thumbnailLink) {
                            linkImage(newNode.firstChild, thumbnailLink);
                            return;
                        }
                        let twitterLink = getTwitterLink(link.href);
                        if (twitterLink) {
                            linkTwitter(newNode.firstChild, twitterLink);
                            return;
                        }
                    });
            });
        });
    });

    // Pass in the target node, as well as the observer options
    observer.observe(target, {childList: true});
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

function getTwitterLink(url) {
    const regex = /((twitter)|x)\.com\/(?<user>[^\/]*)\/status\/(?<id>[^\/]*)/;
    const data = url.match(regex);
    if (!data) {
        return "";
    }
    const sanitizedURL = `https://twitter.com/${data.groups.user}/status/${data.groups.id}`;
    const output = `<blockquote data-conversation="none" data-dnt="true" ${(document.documentElement.classList.contains("tw-root--theme-dark") ? 'data-theme="dark"' : '')} class="twitter-tweet"><a href="${sanitizedURL}"></a><script src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></blockquote>`;
    return output || "";
}

async function getImgurLink(album, identifier) {
    var apiLink = ((album) ? `https://api.imgur.com/3/album/${identifier}/images` : `https://api.imgur.com/3/image/${identifier}`);
    var content = await ((await fetch(apiLink, { "headers": { "Authorization": "Client-ID db1c3074b0b7efc" } })).json());
    return ((album) ? content.data[0].link : content.data.link);
}

function getImageLink(url) {
    let match = /.*\.(?:jpe?g|png|gif|avif|webp)(?:\?.*)?$/gim.exec(url);
    return ((match) ? match[0] : "").replace("media.giphy.com", "media1.giphy.com");
}

function getVideoLink(url) {
    let match = /.*\.(?:mp4)(?:\?.*)?$/gim.exec(url);
    return ((match) ? match[0] : "");
}

function getGiphyLink(url) {
    let match = /^https?:\/\/giphy\.com\/gifs\/(?:.*-)?([a-zA-Z0-9]+)$/gm.exec(url);
    return ((match) ? "https://media1.giphy.com/media/" + match[1] + "/giphy.gif" : "");
}

function getYouTubeLink(url) {
    let match = /^https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&?]+).*$/gm.exec(url);
    return ((match) ? "https://img.youtube.com/vi/" + match[1] + "/mqdefault.jpg" : "");
}

function linkImage(node, imageURL) {
    var image = document.createElement("img");
    node.appendChild(image);
    image.style.display = "none";
    image.style.maxWidth = "100%";
    image.style.maxHeight = "50vh";
    image.style.margin = "0.25em auto 0";
    image.src = imageURL;
    image.addEventListener("load", function() {image.style.display = "block"})
}

function linkVideo(node, videoURL) {
    var video = document.createElement("video");
    node.appendChild(video);
    video.style.display = "none";
    video.style.maxWidth = "100%";
    video.style.maxHeight = "50vh";
    video.style.margin = "0.25em auto 0";
    video.src = videoURL;
    video.autoplay = video.loop = video.muted = true;
    video.addEventListener("canplay", function() {video.style.display = "block"});
}

function linkTwitter(node, tweetHTML) {
    var tweet = document.createElement("div");
    node.appendChild(tweet);
    setInnerHTMLAndExecuteScript(tweet, tweetHTML);
}
