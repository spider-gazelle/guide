Spider-Gazelle ships with a spec helper that leverages [HotTopic](https://github.com/jgaskins/hot_topic) so you can emulate the server and use [HTTP::Client](https://crystal-lang.org/api/latest/HTTP/Client.html) to perform tests.

## Spec Helper

Looking at the [Spider-Gazelle template app](https://github.com/spider-gazelle/spider-gazelle), you'll want to split the following into seperate files

* the application config (controllers, models, logging, security, etc)
* the application entry point (command line parsing, starting the server etc)

This way you can test the app without launching the server

```crystal

require "spec"

# Helper methods for testing controllers (curl, with_server, context)
require "action-controller/spec_helper"

# Your application config
require "../src/config"

```

## Testing routes

End to end testing a request

```crystal

describe YourController do

  # a hot topic client for testing your controllers
  client = AC::SpecHelper.client

  # optional, use to change the response type
  headers = HTTP::Headers{
    "Accept" => "application/yaml",
  }

  it "should welcome you with json" do
    result = client.get("/")
    result.body.should eq %("You're being trampled by Spider-Gazelle!")
    result.headers["Date"].should_not be_nil
  end

  it "should welcome you with yaml" do
    result = client.get("/", headers: headers)
    result.body.should eq "--- You're being trampled by Spider-Gazelle!\n"
    result.headers["Date"].should_not be_nil
  end

end

```

## Unit testing

Unit testing is possible by first grabbing an instance of a controller.

```crystal

describe YourController do

  # instantiate the controller you wish to unit test
  # the HTTP request constitues the server context, it is optional
  controller = YourController.spec_instance(HTTP::Request.new("GET", "/"))

  it "should sum two numbers" do
    welcome.add(10, 30).should eq 40
  end

end

```
