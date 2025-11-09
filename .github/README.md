# Significantly Less Nifty Chat

Userscript for Tampermonkey to inline Images/GIFs, YouTube Thumbnails & Tweets in Twitch chat.

This script was derived from the Paul Saunders' [Nifty Chat Monitor][] script,
created by Paul and with contributions from [LoadingReadyRun][] viewers.

### Features
- inlines linked images
- inlines GIPHY GIFs
- inlines thumbnail images for YouTube video links
- inlines embeds for linked Tweets

## Maintainers Needed!

I know there are quite a few people that find this script very useful,
and a smaller few that recommend it each year while watching [Desert Bus for Hope][];
if you have web/front-end/JS experience you may be able to help keep this script working
feel free to submit Pull Requests with fixes/features and I will endeavour to review and merge them,
and if you would like to take this repository off my hands feel free to contact me and express your desire.

## Installation
- Install the [Tampermonkey][] browser extension
- [View the Raw JS Script File][file]
- Tampermonkey will detect that you're opening a userscript and prompt to install it
- If it doesn't, you can copy the contents of the Raw JS file into a new Tampermonkey userscript

## Usage
- This userscript should work on any live chat on twitch.tv - it won't work on VOD chats.
- When posting a link in chat, note that unless it is a GIPHY or YouTube link
it won't be inlined if it doesn't end in an image extension, or if the url involves ports.
- Tweet embeds may be blocked by Firefox's Enhanced Tracking Protection.

[Nifty Chat Monitor]: https://github.com/paul-lrr/nifty-chat-monitor
[LoadingReadyRun]: https://loadingreadyrun.com
[Desert Bus for Hope]: https://desertbus.org

[Tampermonkey]: https://tampermonkey.net/
[file]: https://github.com/Road-hog123/significantly-less-nifty-chat/raw/master/chat-monitor.user.js
