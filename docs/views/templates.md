# View Templates

Views are managed by default by [kilt](https://github.com/jeromegn/kilt) which allows you to pick between a number of template formats. We recommend reading about Crystal Langs default templating language: [ECR](https://crystal-lang.org/api/latest/ECR.html).


## Rendering

Views are rendered with access to variables in the scope of the calling function. Consider the following:

```crystal
class Welcome < Application
  base "/"

  def index
    welcome_text = "You're being trampled by Spider-Gazelle!"

    respond_with do
      html Kilt.render("src/views/welcome.ecr")
      json({welcome: welcome_text})
    end
  end
end

```

The variable `welcome_text` is made available inside `src/views/welcome.ecr`
