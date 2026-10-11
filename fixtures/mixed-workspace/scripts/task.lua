local value = 1
function Boxed.read(x)
  local inside = x
  return inside
end
local nested = function(x) return x end
Boxed.read(value)
