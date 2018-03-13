# WebSockets

Spider-Gazelle supports WebSockets as a first class construct.
To create a WebSocket route in a controller:

```crystal
class ChatRoom < Application
  # If you would like to keep track of open websockets
  SOCKETS = [] of HTTP::WebSocket

  # WS path: /chat_room/websocket
  ws "/websocket", :websocket do |socket|
    SOCKETS << socket

    # A very simple chat room indeed
    socket.on_message do |message|
      SOCKETS.each { |socket| socket.send message }
    end

    # Clean up any references
    socket.on_close do
      SOCKETS.delete(socket)
    end

    # `.run` is called on the WebSocket automatically when this block returns
  end
end

```

The `socket` object supports a [number of callbacks](https://crystal-lang.org/api/latest/HTTP/WebSocket.html) and filter actions can be used in conjunction with WebSocket routes.
