local wezterm = require 'wezterm'

local config = wezterm.config_builder()

config.font = wezterm.font 'JetBrainsMono Nerd Font Mono'
config.font_size = 12
config.line_height = 1.0
config.custom_block_glyphs = false

config.color_scheme = 'Dark+'
config.window_background_opacity = 0.95

config.window_decorations = 'INTEGRATED_BUTTONS|RESIZE'
config.hide_tab_bar_if_only_one_tab = true
config.window_padding = { left = 8, right = 8, top = 0, bottom = 0 }

config.audible_bell = 'SystemBeep'
config.visual_bell = {
  fade_in_function = 'EaseIn',
  fade_in_duration_ms = 75,
  fade_out_function = 'EaseOut',
  fade_out_duration_ms = 75,
}
config.colors = {
  visual_bell = '#202020',
}

return config
