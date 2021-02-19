const express = require('express');
const app = express();

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

puppeteer.use(StealthPlugin())

let browser

async function init() {
	browser = await puppeteer.launch();
}


// TODO: remove, TESTING
let memory_consumed
let is_log_memory
// keep track of cumulative memory allocated
if (process.argv.length > 2 ) {
	is_log_memory = true;
	memory_consumed = 0; // initialize
}

app.get('/content', async (req, res) => {

	console.log(`received a request for ${req.query.url}`);

	// initialize "globals"
	let data
	let page
	let p_res // puppet client (browser) response

	payload = {
		html: "",
		cookies: "",
		statusCode: -1,
		statusText: "",
		requested_url: req.query.url,
		resolved_url: "",
		error: "",
	}

	await browser.newPage()
		.then(pg => {
			page = pg; // set "global" so we can close in .finally
			return pg
		})
		.then(page => page.goto(req.query.url,
			{
				timeout: 120000 // 120s
			}
		))
		.then(response => {
			p_res = response

			if (req.query.cookies) {
				console.log(`cookies requested for ${req.query.url}: ${JSON.stringify(response.headers())}`);
				payload.cookies = response.headers()["set-cookie"] 
			}

			payload.resolved_url = response.url();
			payload.statusCode = response.status();
			payload.statusText = response.statusText();

			// 200-like status
			if (!response.ok()) {
				throw `errored response: ${req.query.url} returned ${response.status()}, ${response.statusText()}`
			}
			return response.buffer()
		})
		.then(buf => {
			// TODO: remove, TESTING
			if (is_log_memory) {
				memory_consumed += buf.length
			}

			data = buf.toString(); // UTF-8
			payload.html = buf.toString();

			res.status(200);
			res.set('content-type', 'text/json');

			return page
		})
//		.then(pg => {
//			if (req.query.cookies) {
//				console.log(`cookies requested for ${req.query.url}`);
//				page.cookies()
//					.then(arr => payload.cookies = arr)
//					.catch(e => {throw `error processing cookies: ${e}`});
//			}
//		})
		.catch(e => {
			console.log(`big uh-oh: ${e}`);
			res.status(500);
			payload.error = e;
		})
		.finally(() => {
			res.json(payload); // payload.error is non-null if catch
			res.end();
			console.log(`successfully processed ${req.query.url}`);

			// TODO: remove, TESTING
			if (is_log_memory) {
				console.log(`processed ${(memory_consumed >> 20)} MiB (${memory_consumed} bytes) so far`);
			}
			page.close().catch(e => {console.log(`failed to close page for ${req.query.url}: ${e}`)});
		})
})


app.listen(8000, async () => {
	await init() // initialize the browser
	// TODO: remove, TESTING
	if (is_log_memory) {
		console.log("logging memory");
	} else {
		console.log("not logging memory");
	}

	console.log(`listening on port 8000 (${process.pid})`)

	// Here we send the ready signal to PM2
	if (process.send) {
		process.send('ready');
	}
});
