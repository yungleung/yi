-- Rho Class is two-column, where longtable is unavailable. Pandoc's ordinary
-- Markdown table becomes a full-width table* using the class's booktabs style.
local function latex_blocks(blocks)
  local rendered = pandoc.write(pandoc.Pandoc(blocks), 'latex')
  return rendered:gsub('^%s+', ''):gsub('%s+$', '')
end

local function latex_cell(cell)
  return latex_blocks(cell.contents)
end

local function alignment(spec)
  local alignment = tostring(spec[1])
  if alignment == 'AlignRight' then
    return 'r'
  elseif alignment == 'AlignCenter' then
    return 'c'
  end
  return 'l'
end

function Table(tbl)
  local columns = #tbl.colspecs
  local spec = {}
  for index = 1, columns do
    spec[index] = alignment(tbl.colspecs[index])
  end

  local lines = {
    '\\begin{table*}[t]',
    '\\centering'
  }
  local caption = latex_blocks(tbl.caption.long)
  if caption ~= '' then
    lines[#lines + 1] = '\\caption{' .. caption .. '}'
  end
  lines[#lines + 1] = '\\begin{tabular}{' .. table.concat(spec) .. '}'
  lines[#lines + 1] = '\\toprule'

  local function row(cells)
    local values = {}
    for index, cell in ipairs(cells) do
      values[index] = latex_cell(cell)
    end
    lines[#lines + 1] = table.concat(values, ' & ') .. ' \\\\'
  end

  for _, header in ipairs(tbl.head.rows) do
    row(header.cells)
  end
  lines[#lines + 1] = '\\midrule'
  for _, body in ipairs(tbl.bodies) do
    for _, body_row in ipairs(body.body) do
      row(body_row.cells)
    end
  end
  lines[#lines + 1] = '\\bottomrule'
  lines[#lines + 1] = '\\end{tabular}'
  lines[#lines + 1] = '\\end{table*}'

  return pandoc.RawBlock('latex', table.concat(lines, '\n'))
end
