-- Lower Yi's semantic callouts into the awesomebox block environments loaded
-- by this package's template.
--
-- A default `Important` title becomes an `importantblock`; a custom
-- `Check the margins` title becomes a bold lead-in in the same block.
--
-- May read: the callout, callout-<kind>, and callout-title Div classes.
-- Upholds: only the five built-in kinds are converted; other Divs are left
-- unchanged.

local environments = {
  ["callout-note"] = "noteblock",
  ["callout-tip"] = "tipblock",
  ["callout-important"] = "importantblock",
  ["callout-warning"] = "warningblock",
  ["callout-caution"] = "cautionblock"
}

local default_titles = {
  noteblock = "Note",
  tipblock = "Tip",
  importantblock = "Important",
  warningblock = "Warning",
  cautionblock = "Caution"
}

local function callout_blocks(div, environment)
  local body = pandoc.List()
  local custom_title = div.attributes["title"]
  for _, block in ipairs(div.content) do
    if block.t == "Div" and block.classes:includes("callout-title") then
      custom_title = custom_title or pandoc.utils.stringify(block)
    else
      body:insert(block)
    end
  end

  if custom_title == nil or custom_title == "" or custom_title == default_titles[environment] then
    return body
  end

  if #body > 0 and body[1].t == "Para" then
    local inlines = pandoc.List({ pandoc.Strong(pandoc.Str(custom_title)), pandoc.Space() })
    inlines:extend(body[1].content)
    body[1] = pandoc.Para(inlines)
  else
    body:insert(1, pandoc.Para({ pandoc.Strong(pandoc.Str(custom_title)) }))
  end
  return body
end

local function callout_environment(div)
  local environment = nil
  for class, name in pairs(environments) do
    if div.classes:includes(class) then
      environment = name
      break
    end
  end
  if environment == nil then
    return nil
  end

  local blocks = pandoc.List()
  blocks:insert(pandoc.RawBlock("latex", "\\begin{" .. environment .. "}"))
  for _, block in ipairs(callout_blocks(div, environment)) do
    blocks:insert(block)
  end
  blocks:insert(pandoc.RawBlock("latex", "\\end{" .. environment .. "}"))
  return blocks
end

function Div(div)
  return callout_environment(div) or div
end
