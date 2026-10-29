local environments = {
  ["callout-note"] = "note",
  ["callout-info"] = "info",
}

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
  for _, block in ipairs(div.content) do
    local title = block.t == "Div" and block.classes:includes("callout-title")
    if not title then
      blocks:insert(block)
    end
  end
  blocks:insert(pandoc.RawBlock("latex", "\\end{" .. environment .. "}"))
  return blocks
end

function Div(div)
  return callout_environment(div) or div
end
