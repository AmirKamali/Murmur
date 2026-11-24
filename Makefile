.PHONY: serve check

serve:
	./server/start-murmur.sh

check:
	node --check extension/background.js extension/content.js extension/offscreen.js extension/options.js extension/popup.js extension/tts-client.js
	node --test tests/*.test.mjs
	bash -n server/start-murmur.sh
	node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))"
