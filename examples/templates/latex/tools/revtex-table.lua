-- Turn Pandoc pipe tables into REVTeX's ruled table environment. Pandoc's
-- longtable column specification conflicts with the table hooks REVTeX uses.

local function latex(blocks)
  if blocks == nil or #blocks == 0 then
    return ""
  end
  return pandoc.write(pandoc.Pandoc(blocks), "latex"):gsub("%s+$", "")
end

local function alignment(spec)
  local value = spec[1]
  local tag = type(value) == "table" and value.t or tostring(value)
  if tag == "AlignRight" then
    return "r"
  elseif tag == "AlignCenter" then
    return "c"
  end
  return "l"
end

local function row(cells, separator)
  local rendered = {}
  for _, cell in ipairs(cells) do
    rendered[#rendered + 1] = latex(cell.contents)
  end
  return table.concat(rendered, " & ") .. separator
end

function Table(tbl)
  local columns = {}
  for _, spec in ipairs(tbl.colspecs) do
    columns[#columns + 1] = alignment(spec)
  end

  local rows = {}
  if tbl.head ~= nil then
    for _, header in ipairs(tbl.head.rows) do
      rows[#rows + 1] = row(header.cells, " \\\\")
    end
  end
  for _, body in ipairs(tbl.bodies) do
    for _, body_row in ipairs(body.body) do
      rows[#rows + 1] = row(body_row.cells, " \\\\")
    end
  end

  local caption = latex(tbl.caption.long)
  local pieces = {
    "\\begin{table*}[t]",
    "\\caption{" .. caption .. "}",
    tbl.attr.identifier ~= "" and ("\\label{" .. tbl.attr.identifier .. "}") or "",
    "\\begin{ruledtabular}",
    "\\begin{tabular}{" .. table.concat(columns) .. "}",
    "\\toprule",
    table.remove(rows, 1)
  }
  if pieces[3] == "" then
    table.remove(pieces, 3)
  end
  if #rows > 0 then
    pieces[#pieces + 1] = "\\midrule"
    for _, value in ipairs(rows) do
      pieces[#pieces + 1] = value
    end
  end
  pieces[#pieces + 1] = "\\bottomrule"
  pieces[#pieces + 1] = "\\end{tabular}"
  pieces[#pieces + 1] = "\\end{ruledtabular}"
  pieces[#pieces + 1] = "\\end{table*}"
  return pandoc.RawBlock("latex", table.concat(pieces, "\n"))
end
