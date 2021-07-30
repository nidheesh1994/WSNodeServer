const http = require("http");
// const https = require('https');
// const hostname = "ecar@123
//const hostname = "172.31.29.174"; //private IP of the staging server
// const hostname = "172.31.7.75"; //private IP of the production server
const hostname = "localhost"; //private IP of the local server
const port = 3002; //port number of production server
// const port = 3000; //port number of staging server

//const host_address = "https://evaply.bitkit.dk/"; // staging address
//const host_address = "http://phases.evaply.local/"; // local address
const host_address = "https://evaply.com/"; // production address

const express = require("express");
const axios = require("axios");
const crypto = require('crypto'),
    fs = require("fs");
// staging server certificates
// var privateKey = fs.readFileSync('/etc/letsencrypt/live/evaply.bitkit.dk/privkey.pem').toString();
// var certificate = fs.readFileSync('/etc/letsencrypt/live/evaply.bitkit.dk/fullchain.pem').toString();

// production server certificates
// var privateKey = fs.readFileSync('/etc/letsencrypt/live/evaply.com/privkey.pem').toString();
// var certificate = fs.readFileSync('/etc/letsencrypt/live/evaply.com/fullchain.pem').toString();

// var credentials = {key: privateKey, cert: certificate};

var app = express();
//Create HTTP server and listen on port 3000 for requests
var server = http.createServer((req, res) => {
    //Set the response HTTP header with HTTP status and Content type
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("Hello World\n");
});
//listen for request on port 3000, and as a callback function have the port listened on logged
server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

// catch 404 and forward to error handler
var io = require("socket.io").listen(server);

io.set("origins", "*:*");
var users = [];
var notificationUserList = [];

io.on("connection", function (socket) {
    socket.emit("connection", "Connection Created.");
    socket.on("set_user_id", function (userId) {
        // console.log("user Id ::" + userId);
        if (users[userId]) {
            users[userId].push(socket);
        } else {
            users[userId] = [];
            users[userId].push(socket);
        }
    });

    socket.on("backend_test_message", function (data) {
        console.log(data);
        if ("user_id" in data) {
            users[data["user_id"]].emit("test_notification", data);
        }
    });

    socket.on("disconnect", function () {
        console.log(" Socket has been disconnected - Socket-Id ::" + socket.id);
        users.forEach(user => {
            let closedSocketIndex = user.findIndex(u => u.id === socket.id);
            if (closedSocketIndex > -1) {
                user.splice(closedSocketIndex, 1);
            }
        });
    });


    /***********************************************************************************/
    /**
     * Evaply Connections
     */
    /***********************************************************************************/

    /**
     * Send push notification to FE on new comment added
     */
    socket.on("comment_added", function (data) {
        // loop through the user is
        data["users"].forEach((userId) => {
            // if the socket initialized for the user id
            if (users[userId]) {
                // loop through sockets assigned for the users
                // multiple sockets are assigned for a single user to handle when user logged in multiple windows
                users[userId].forEach((socket) => {
                    // emit event
                    socket.emit("comment_added", data);
                });
            }
        });
    });

    socket.on("deleted_notifications", function (data) {
        let notifications = data.notifications;
        data["users"].forEach((user) => {
            if (users[user.id]) {
                users[user.id].forEach((socket) => {
                    socket.emit("notifications_deleted", notifications);
                });
            }
        });
    });

    /*
    Events can be send by this
     */
    socket.on("forecastEvent", function (data) {
        let event = data.event;
        console.log('forecastEvent', data);
        data["users"].forEach((user) => {
            if (users[user]) {
                users[user].forEach((socket) => {
                    socket.emit("forecastEvent", event);
                });
            }
        });
    });

    /**
     * Send push notification on notification
     */
    /*socket.on("new_notification", (data) => {
        data["users"].forEach((id) => {
            if (users[id]) {
                users[id].forEach((socket) => {
                    socket.emit("new_notification", data);
                })
            }
        })
    });*/

    /**
     * Send typing notification to the active users
     * @data: include the users to which the notification to be send
     */
    socket.on("typing", (data) => {
        data.users.forEach((id) => {
            if (users[id]) {
                users[id].forEach((socket) => {
                    socket.emit("typing", data);
                })
            }
        })
    });


    /**
     * Trigger on read notification.
     * Used if the current user having multiple browser tabs open and when read from one tab will read in all other tabs.
     * Exclude the current tab socket by checking the socket id.
     */
    socket.on("read_notification", (data) => {
        if (users[data.user]) {
            users[data.user].forEach((userSocket) => {
                if (socket.id !== userSocket.id) {
                    userSocket.emit("read_notification", data);
                }
            });
        }
    });

    /**
     * Send push notification on notification
     * Handle email notification if user not connected
     */
    socket.on("new_notification", (data) => {
        console.log(data);
        data["users"].forEach((id) => {
            let isConnected = false;
            if (users[id]) {
                users[id].forEach((socket, key) => {
                    if (socket.connected) { // check if socket is connected
                        isConnected = true; // set flag
                        if (!data.message_id) {
                            console.log('emited notification');
                            socket.emit("new_notification", data); // emit
                        } else {
                            console.log(data.notify);
                            // if(data.notify.sendSystemNotification){
                            console.log('emitted notification for message');
                            socket.emit("new_notification", data);
                            // }
                        }
                    } else {
                        users[id].splice(key, 1); // remove socket if not connected
                    }
                })
            }
            let notification = JSON.parse(data.notification);
            if (!isConnected) {
                users.splice(id, 1);
                if (notification.heading === 'A new message' && data.message_id && data.notify.sendEmailNotification) {
                    console.log("Send email notification");
                    let userData = {
                        user_id: id,
                        message_id: data.message_id
                    };
                    axios.post(host_address + 'notification/send/message/email', userData)
                }
            } else {
                // if socket connected, then keep a list of users

                // push the id to the array
                if (notification.heading === 'A new message' && data.message_id && data.notify.sendEmailNotification) {
                    console.log('Pushed id to list');
                    if (notificationUserList[data.message_id]) {
                        notificationUserList[data.message_id].push(id);
                    } else {
                        notificationUserList[data.message_id] = [];
                        notificationUserList[data.message_id].push(id);
                    }
                }

            }
        })
    });

    /**
     * Send email request to server
     * This will handle the `multiple email send to same user` issue
     * Once the email send, the user will remove from the list. It will prevent duplicate emails.
     */
    socket.on('sendEmailNotification', data => {
        console.log('sendEmailNotification', notificationUserList);
        // check if message id exists
        if (notificationUserList[data.message_id]) {
            // get the index of requested user from the list
            let index = notificationUserList[data.message_id].findIndex(l => l === data.user_id);
            // if user exists
            if (index > -1) {
                console.log('has index')
                // remove from the list
                notificationUserList[data.message_id].splice(index, 1);
                // send request to server
                axios.post(host_address + 'notification/send/message/email', data)

                if (notificationUserList[data.message_id].length <= 0) {
                    notificationUserList.splice(data.message_id, 1);
                }
                console.log('after push', notificationUserList);
            }
        }
    });

});
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render("error");
});

module.exports = app;

