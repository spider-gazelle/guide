## Annotations for Params

You can document the parameters of your queries by annotations.

```crystal

class Articles < AC::Base
  base "/articles"

  @[AC::Route::GET("/")]
  def all_articles(
    @[AC::Param::Info(description: "Filter by tag:", example: "AngularJS", required: false)]
    tag : String?,
    @[AC::Param::Info(description: "Filter by author:", example: "jake", require: false)]
    author : String?,
    @[AC::Param::Info(description: "Favorited by user:", example: "jake", require: false)]
    favorited : String?,
    @[AC::Param::Info(description: "Limit number of articles (default is 20):", example: "20", require: false)]
    limit : UInt32?,
    @[AC::Param::Info(description: "Offset/skip number of articles (default is 0):", example: "0", require: false)]
    offset : UInt32?,

    @[AC::Param::Info(header: "X-Request-UUID", description: "UUID to use for this request", example: "ba714f86-cac6-42c7-8956-bcf5105e1b81")]
    value : UUID? = nil,
  )

```

You can refer to [Parameter OpenAPI Specification](https://spec.openapis.org/oas/v3.1.0#parameter-object)
