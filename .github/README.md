# Significantly Less Nifty Chat

Userscript for Tampermonkey to inline Images, GIPHY GIFs & YouTube Thumbnails
in Twitch chat. It does nothing else.

This script was derived from the Paul Saunders'
[Nifty Chat Monitor](https://github.com/paul-lrr/nifty-chat-monitor) script,
created by Paul and with contributions from
[LoadingReadyRun](https://loadingreadyrun.com) viewers.

### Features
- inlines linked images
- inlines GIPHY GIFs
- inlines thumbnail images for YouTube video links

## Installation
- Install the [Tampermonkey](https://tampermonkey.net/) browser extension
- [View the Raw JS Script File](https://github.com/Road-hog123/significantly-less-nifty-chat/raw/master/chat-monitor.user.js)
- Tampermonkey will detect that you're opening a userscript and prompt to
install it
- If it doesn't, you can copy the contents of the Raw JS file into a new
Tampermonkey userscript

## Usage
- This userscript should work on any live chat on twitch.tv - it won't work on
VOD chats.
- When posting a link in chat, note that it won't be inlined if it doesn't end
in an image extension, or if the url involves ports.
