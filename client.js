import io from 'socket.io-client';


window.globalInstance = {
    notify: null,
    socket: io.connect(env.socket_ip, { // init socket id configs
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 1000
    })
};


window.globalInstance.socket.on("listner_name", (data) => {
        //logic
});

