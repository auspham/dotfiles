source $HOME/.config/nvim/vim-plug/plugins.vim
set number
set encoding=UTF-8
autocmd BufWritePre *.js Neoformat
set tabstop=8 softtabstop=0 expandtab shiftwidth=4 smarttab

" Activate rainbow bracket
let g:rainbow_active = 1

" Vim move line
nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
inoremap <A-j> <Esc>:m .+1<CR>==gi
inoremap <A-k> <Esc>:m .-2<CR>==gi
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv
