function Div(div)
  if not div.classes:includes("callout") then
    return nil
  end

  local title = pandoc.utils.stringify(div.content[1].content)
  local blocks = pandoc.List({ pandoc.Plain("Filtered " .. title) })
  for index = 2, #div.content do
    blocks:insert(div.content[index])
  end
  return pandoc.Div(blocks, pandoc.Attr("", { "callout-output" }))
end
