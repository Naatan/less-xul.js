(function (tree) {

tree.Variable = function (name, index, file, sheet) { this.name = name, this.index = index, this.file = file, this.sheet = sheet };
tree.Variable.prototype = {
    eval: function (env) {
        var variable, v, name = this.name;

        if (name.indexOf('@@') == 0) {
            name = '@' + new(tree.Variable)(name.slice(1)).eval(env).value;
        }
        
        if (this.evaluating) {
            throw { type: 'Name',
                    message: "Recursive variable definition for " + name,
                    filename: this.file,
                    index: this.index };
        }
        
        this.evaluating = true;

        if (variable = tree.find(env.frames, function (frame) {
            if (v = frame.variable(name)) {
                return v.value.eval(env);
            }
        })) {
            var _name = name.substr(1);
            if (less.variables[_name] === undefined) {
                less.variables[_name] = {};
            }
            
            less.variables[_name][extractIdFromSheet(this.sheet)] = true;
            
            this.evaluating = false;
            return variable;
        }
        else {
            log("Warning: variable " + name + " ("+this.file+") is undefined");
            return false;
        }
    }
};

})(require('../tree'));
