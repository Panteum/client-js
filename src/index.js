
const child_process = require('child_process')

const CLIENT_COMMAND = process.env.PANTEUM_CLIENT || "panteum-client";

function create () {
    // Response callback queue
    const callbacks = [];

    const client = {
        closed: false
    };

    const client_process = child_process.spawn(CLIENT_COMMAND);

    // Accumulated buffer of client
    let buffer = '';

    function error (msg) {
        // Reject any further request to the client
        client.closed = true;

        // If there are waiting requests, reject them
        if (callbacks.length > 0) {
            const thrown_error = new Error(msg);
            for (let i = 0; i < callbacks.length; i++) {
                callbacks[i].reject(thrown_error);
            }
            callbacks.length = 0;
        }

        console.error(msg);
    }

    client_process.on('error', err => {
        error(`Failed to spawn '${CLIENT_COMMAND}': ${err.code}`)
    });

    // Adapted from
    // https://gist.github.com/TooTallNate/1785026
    client_process.stdout.on('data', function (data) {
        buffer += data;
        let n = buffer.indexOf('\n\n');

        while (n >= 0) {
            const response = buffer.slice(0, n);

            next_callback = callbacks.splice(0, 1)[0];
            if (next_callback) {
                next_callback.resolve(response);
            } else {
                console.error("No request expecting response:" + response);
            }

            // Skip the two newlines
            buffer = buffer.slice(n + 2);

            n = buffer.indexOf('\n\n');
        }
    })

    // Redirect stderr to main process
    client_process.stderr.on('data', function (data) {
        process.stderr.write(data)
    })

    client_process.on('close', code => {
        // Create the error message
        const error_message = code === 0
            ? `'${CLIENT_COMMAND}' terminated`
            : `'${CLIENT_COMMAND}' failed with code ${code}`;

        error(error_message)
    })

    function sendRequest (request) {

        if (request instanceof Array) {
            request = request.join('\n');
        }

        // Combine consecutive line breaks
        request = request.replace(/\n+/g, '\n');

        // Ensure a line break at the end
        if (request.slice(-1) != '\n') {
            request += '\n';
        }

        // Double that newline
        request += '\n';

        console.log("COMMAND:\n" + request)

        // Because consecutive line breaks were removed, it's guaranteed.
        // that there are exactly 2 line breaks at the end.
        // Panteum Client uses double line break to signal the end of the request.

        return new Promise(function (resolve, reject) {
            if (client.closed) {
                reject(new Error("Panteum client is closed"));
            } else {
                callbacks.push({ resolve, reject });
                client_process.stdin.write(request);
            }
        })
    }

    client.sendRequest = sendRequest

    return client
}


module.exports.create = create;
