# C/C++ Module Creator

An extension of quickly creating templated C/C++ modules to reduce amount of manual work.

## Requirements

Repository has to have `templates` or `.templates` directory somewhere in the target repository (depth < 10 by default).

Template directory structure, the names are static as of now.

```
(templates | .templates) /
├── template.header.hpp
├── template.src.cpp
├── template.test.cpp
├── template.CMakeLists.txt
└── template.test.CMakeLists.txt
```

## Module structure

Default module structure is as follows
```
<module-name>/
├── include/
│   └── <module-name>.hpp (template: template.header.hpp)
│
├── src/
│   └── <module-name>.cpp (template: template.src.cpp)
│
├── tests/
│   ├── CMakeLists.txt (template: template.test.CMakeLists.txt)
│   └── test_<module-name>.cpp (template: template.test.cpp)
│
└── CMakeLists.txt (template: template.CMakeLists.txt)
```

## Patterns replaced

Following pattern pairs are used for replacing

| Pattern | Replacement |
|---|---|
| @MODULE_NAME@ | Inputted module name in whatever case was used |
| @MODULE_NAME_UPPER@ | Inputted module name in uppercase |
| @MODULE_NAME_LOWER@ | Inputted module name in lowercase |
